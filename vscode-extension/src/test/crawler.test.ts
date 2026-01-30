
import { expect } from 'chai';
import * as sinon from 'sinon';


import axios from 'axios';
import { Crawler } from '../crawler/Crawler';

describe('Crawler Integration Tests', () => {
    let sandbox: sinon.SinonSandbox;
    let axiosGetStub: sinon.SinonStub;
    let fsWriteFileSyncStub: sinon.SinonStub;
    let fsReadFileSyncStub: sinon.SinonStub;
    let fsMkdirSyncStub: sinon.SinonStub;
    let fsExistsSyncStub: sinon.SinonStub;

    const rootPath = '/tmp/test-output';
    const config = {
        output: 'skills',
        flat: true,
        rules: [
            { url: 'https://example.com/docs', action: 'include', subpaths: true } as any
        ]
    };

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        axiosGetStub = sandbox.stub(axios, 'get');
        fsWriteFileSyncStub = sandbox.stub();
        fsReadFileSyncStub = sandbox.stub();
        fsMkdirSyncStub = sandbox.stub();
        fsExistsSyncStub = sandbox.stub();
        fsExistsSyncStub.returns(true); // Assume dir exists for most tests
    });

    const getMockFs = () => ({
        writeFileSync: fsWriteFileSyncStub,
        readFileSync: fsReadFileSyncStub,
        mkdirSync: fsMkdirSyncStub,
        existsSync: fsExistsSyncStub
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should crawl a single page and save it', async () => {
        const html = `
            <html>
                <head><title>Test Page</title></head>
                <body>
                    <article>
                        <h1>Hello World</h1>
                        <p>This is a test.</p>
                    </article>
                </body>
            </html>
        `;

        axiosGetStub.withArgs('https://example.com/docs').resolves({
            headers: { 'content-type': 'text/html; charset=utf-8' },
            data: html
        });

        const crawler = new Crawler(rootPath, config, getMockFs());
        await crawler.crawl();

        expect(axiosGetStub.calledWith('https://example.com/docs')).to.be.true;
        expect(fsWriteFileSyncStub.calledOnce).to.be.true;

        const [filePath, content] = fsWriteFileSyncStub.firstCall.args;
        expect(filePath).to.include('example_com_docs');
        expect(filePath).to.include('SKILL.md');
        expect(content).to.include('# Test Page');
        expect(content).to.include('Hello World');
    });

    it('should follow subpaths if enabled', async () => {
        const rootUrl = 'https://example.com/docs';
        const subPageUrl = 'https://example.com/docs/subpage';

        const rootHtml = `
            <html>
                <body>
                    <a href="${subPageUrl}">Subpage</a>
                    <a href="https://other.com">External</a>
                </body>
            </html>
        `;
        const subPageHtml = `<html><body><p>Content</p></body></html>`;

        axiosGetStub.withArgs(rootUrl).resolves({
            headers: { 'content-type': 'text/html' },
            data: rootHtml
        });
        axiosGetStub.withArgs(subPageUrl).resolves({
            headers: { 'content-type': 'text/html' },
            data: subPageHtml
        });

        const crawler = new Crawler(rootPath, {
            ...config,
            rules: [{ url: rootUrl, action: 'include', subpaths: true }]
        }, getMockFs());

        await crawler.crawl();

        // Should call root and subpage
        expect(axiosGetStub.calledWith(rootUrl)).to.be.true;
        expect(axiosGetStub.calledWith(subPageUrl)).to.be.true;
        // Should NOT call external
        expect(axiosGetStub.calledWith('https://other.com')).to.be.false;

        expect(fsWriteFileSyncStub.calledTwice).to.be.true;
    });

    it('should ignore URLs matching ignore rules', async () => {
        const rootUrl = 'https://example.com/docs';
        const ignoredUrl = 'https://example.com/docs/ignored';

        const rootHtml = `
            <html>
                <body>
                    <a href="${ignoredUrl}">Ignored Link</a>
                </body>
            </html>
        `;

        axiosGetStub.withArgs(rootUrl).resolves({
            headers: { 'content-type': 'text/html' },
            data: rootHtml
        });

        const crawler = new Crawler(rootPath, {
            ...config,
            rules: [
                { url: rootUrl, action: 'include', subpaths: true },
                { url: ignoredUrl, action: 'ignore' }
            ]
        }, getMockFs());

        await crawler.crawl();

        expect(axiosGetStub.calledWith(rootUrl)).to.be.true;
        expect(axiosGetStub.calledWith(ignoredUrl)).to.be.false;
    });

    it('should handle non-html content gracefully', async () => {
        axiosGetStub.resolves({
            headers: { 'content-type': 'application/json' },
            data: {}
        });

        const crawler = new Crawler(rootPath, config);
        await crawler.crawl();

        expect(fsWriteFileSyncStub.notCalled).to.be.true;
    });

    it('should respect hierarchical output config', async () => {
        const hierarchyConfig = { ...config, flat: false };
        const crawler = new Crawler(rootPath, hierarchyConfig, getMockFs());

        const html = `<html><title>Hierarchy</title></html>`;
        axiosGetStub.resolves({ headers: { 'content-type': 'text/html' }, data: html });

        await crawler.crawl();

        const [filePath] = fsWriteFileSyncStub.firstCall.args;
        // logic: rootPath/skills/hostname/pathname
        // url: https://example.com/docs
        // path: example.com/docs.md (simplified logic in Crawler.ts)
        expect(filePath).to.contain('example.com');
        expect(filePath).to.contain('docs.md');
    });

    it('should send If-Modified-Since header if file exists', async () => {
        const lastMod = 'Wed, 21 Oct 2015 07:28:00 GMT';
        const existingContent = `---
name: test
metadata:
  last_modified: ${lastMod}
---
# Content`;

        axiosGetStub.resolves({ status: 304 }); // Not modified
        fsExistsSyncStub.returns(true);
        fsReadFileSyncStub.returns(Buffer.from(existingContent));

        const crawler = new Crawler(rootPath, config, getMockFs());
        await crawler.crawl();

        // Check if header was sent
        const call = axiosGetStub.getCall(0);
        // axios args: [url, config]
        const reqConfig = call.args[1];
        expect(reqConfig.headers['If-Modified-Since']).to.equal(lastMod);

        // Should not have written file
        expect(fsWriteFileSyncStub.notCalled).to.be.true;
    });

    it('should update file if modified even if file exists', async () => {
        const lastMod = 'Wed, 21 Oct 2015 07:28:00 GMT';
        const existingContent = `---
metadata:
  last_modified: ${lastMod}
---`;

        const newHtml = `<html><body>New Content</body></html>`;

        fsExistsSyncStub.returns(true);
        fsReadFileSyncStub.returns(Buffer.from(existingContent));

        // Server returns 200 OK with new content
        axiosGetStub.resolves({
            status: 200,
            headers: { 'content-type': 'text/html' },
            data: newHtml
        });

        const crawler = new Crawler(rootPath, config, getMockFs());
        await crawler.crawl();

        const call = axiosGetStub.getCall(0);
        const reqConfig = call.args[1];
        expect(reqConfig.headers['If-Modified-Since']).to.equal(lastMod);

        expect(fsWriteFileSyncStub.calledOnce).to.be.true;
    });

    it('should match subpaths strictly when rule has no trailing slash', async () => {
        const rootUrl = 'https://example.com/posts'; // No trailing slash
        const validSub = 'https://example.com/posts/1';
        const invalidSub = 'https://example.com/posts-extra'; // Partial match

        const rootHtml = `
            <html>
                <body>
                    <a href="${validSub}">Valid</a>
                    <a href="${invalidSub}">Invalid</a>
                </body>
            </html>
        `;
        const subHtml = `<html></html>`;

        axiosGetStub.withArgs(rootUrl).resolves({
            headers: { 'content-type': 'text/html' },
            data: rootHtml
        });
        axiosGetStub.withArgs(validSub).resolves({
            headers: { 'content-type': 'text/html' },
            data: subHtml
        });

        const crawler = new Crawler(rootPath, {
            ...config,
            rules: [{ url: rootUrl, action: 'include', subpaths: true }]
        }, getMockFs());

        await crawler.crawl();

        expect(axiosGetStub.calledWith(rootUrl)).to.be.true;
        expect(axiosGetStub.calledWith(validSub)).to.be.true;
        expect(axiosGetStub.calledWith(invalidSub)).to.be.false;

        expect(fsWriteFileSyncStub.calledTwice).to.be.true;
    });

    it('should crawl sitemap if explicitly provided', async () => {
        const sitemapUrl = 'https://example.com/sitemap.xml';
        const postUrl = 'https://example.com/post-1';

        const sitemapXml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
                <url>
                    <loc>${postUrl}</loc>
                    <lastmod>2023-01-01</lastmod>
                </url>
            </urlset>
        `;
        const postHtml = `<html><body>Post Content</body></html>`;

        // Mock Sitemap
        axiosGetStub.withArgs(sitemapUrl).resolves({
            status: 200,
            headers: { 'content-type': 'application/xml' },
            data: sitemapXml
        });

        // Mock Post
        axiosGetStub.withArgs(postUrl).resolves({
            headers: { 'content-type': 'text/html' },
            data: postHtml
        });

        const crawler = new Crawler(rootPath, {
            ...config,
            rules: [{ url: sitemapUrl, action: 'include', subpaths: true }]
        }, getMockFs());

        await crawler.crawl();

        expect(axiosGetStub.calledWith(sitemapUrl)).to.be.true;
        expect(axiosGetStub.calledWith(postUrl)).to.be.true;
        expect(fsWriteFileSyncStub.calledOnce).to.be.true; // only post, sitemap itself isn't saved as skill
    });

    it('should NOT auto-discover sitemaps from HTML pages', async () => {
        const rootUrl = 'https://example.com/docs';
        const rootHtml = `<html><body>Link: <a href="/docs/1">One</a></body></html>`;

        axiosGetStub.withArgs(rootUrl).resolves({
            headers: { 'content-type': 'text/html' },
            data: rootHtml
        });
        axiosGetStub.withArgs('https://example.com/docs/1').resolves({
            headers: { 'content-type': 'text/html' },
            data: '<html></html>'
        });

        // Ensure no call to robots.txt or sitemap.xml
        axiosGetStub.withArgs('https://example.com/robots.txt').resolves({ status: 404 });
        axiosGetStub.withArgs('https://example.com/sitemap.xml').resolves({ status: 404 });

        const crawler = new Crawler(rootPath, {
            ...config,
            rules: [{ url: rootUrl, action: 'include', subpaths: true }]
        }, getMockFs());

        await crawler.crawl();

        expect(axiosGetStub.calledWith(rootUrl)).to.be.true;
        expect(axiosGetStub.calledWith('https://example.com/robots.txt')).to.be.false;
        expect(axiosGetStub.calledWith('https://example.com/sitemap.xml')).to.be.false;
    });

    it('should bundle subpaths into references folder if bundle flag is true', async () => {
        const rootUrl = 'https://example.com/pkg/v1';
        const subUrl = 'https://example.com/pkg/v1/changelog';

        const rootHtml = `<html><a href="${subUrl}">Changelog</a></html>`;
        const subHtml = `<html><h1>Changelog</h1></html>`;

        axiosGetStub.withArgs(rootUrl).resolves({
            headers: { 'content-type': 'text/html' },
            data: rootHtml
        });
        axiosGetStub.withArgs(subUrl).resolves({
            headers: { 'content-type': 'text/html' },
            data: subHtml
        });

        // Other calls 404
        axiosGetStub.resolves({ status: 404, headers: {} });

        const rules = [{
            url: rootUrl,
            subpaths: true,
            action: 'include',
            bundle: true
        } as any];

        const crawler = new Crawler(rootPath, { ...config, rules }, getMockFs());
        await crawler.crawl();

        // Bundle Folder: example_com_pkg_v1
        // Root file -> SKILL.md
        // Sub file -> references/changelog.md

        // Use matchers to be robust against full path
        const rootMatcher = sinon.match((p: string) => p.includes('example_com_pkg_v1') && p.endsWith('SKILL.md'));
        const refMatcher = sinon.match((p: string) => p.includes('example_com_pkg_v1') && p.includes('references') && p.endsWith('changelog.md'));

        expect(fsWriteFileSyncStub.calledWith(rootMatcher, sinon.match.string)).to.be.true;
        expect(fsWriteFileSyncStub.calledWith(refMatcher, sinon.match.string)).to.be.true;
    });
});
