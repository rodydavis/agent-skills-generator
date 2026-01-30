
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import * as yaml from 'js-yaml';

interface Config {
    output: string;
    flat: boolean;
    config?: string;
    file_rename?: string;
    rules: Rule[];
}

interface Rule {
    url: string;
    subpaths?: boolean;
    action: 'include' | 'ignore';
    bundle?: boolean;
}

export interface FileSystemDependencies {
    writeFileSync: (path: fs.PathLike | number, data: string | NodeJS.ArrayBufferView, options?: fs.WriteFileOptions) => void;
    readFileSync: (path: fs.PathLike, options?: { encoding?: null; flag?: string; } | null) => Buffer | string;
    mkdirSync: (path: fs.PathLike, options?: fs.MakeDirectoryOptions & { recursive: true; }) => string | undefined;
    existsSync: (path: fs.PathLike) => boolean;
}

export class Crawler {
    private visited = new Set<string>();
    private scannedDomains = new Set<string>();
    private config: Config;
    private rootPath: string;
    private turndownService: TurndownService;
    private fs: FileSystemDependencies;
    private _onProgress?: (msg: string) => void;

    constructor(rootPath: string, config: Config, fileSystem?: FileSystemDependencies) {
        this.rootPath = rootPath;
        this.config = config;
        this.fs = fileSystem || {
            writeFileSync: fs.writeFileSync,
            readFileSync: fs.readFileSync,
            mkdirSync: (path: fs.PathLike, options) => fs.mkdirSync(path, options),
            existsSync: fs.existsSync
        };
        this.turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced'
        });
    }

    public onProgress(callback: (msg: string) => void) {
        this._onProgress = callback;
    }

    private log(msg: string) {
        if (this._onProgress) {
            this._onProgress(msg);
        }
        console.log(msg);
    }

    public async crawl() {
        this.log('Starting crawl...');
        this.visited.clear();
        this.scannedDomains.clear();

        // Process "include" rules
        for (const rule of this.config.rules) {
            if (rule.action === 'include') {
                await this.visit(rule.url, rule);
            }
        }
        this.log('Crawl finished.');
    }

    private async visit(url: string, rule: Rule) {
        // Strip hash
        const urlObj = new URL(url);
        urlObj.hash = '';
        const cleanUrl = urlObj.toString();

        if (this.visited.has(cleanUrl)) { return; }

        // Basic check for ignore rules
        if (this.shouldIgnore(cleanUrl)) {
            this.log(`Ignoring: ${cleanUrl}`);
            return;
        }

        this.visited.add(cleanUrl);
        this.log(`Visiting: ${cleanUrl}`);

        try {
            const config: any = {};
            const existingPath = this.getFilePath(cleanUrl, rule);

            if (this.fs.existsSync(existingPath)) {
                try {
                    const content = this.fs.readFileSync(existingPath).toString();
                    if (content.startsWith('---')) {
                        const end = content.indexOf('---', 3);
                        if (end > 3) {
                            const fm = content.substring(3, end);
                            const meta = yaml.load(fm) as any;
                            const lastModified = meta?.metadata?.last_modified;
                            if (lastModified) {
                                config.headers = { 'If-Modified-Since': lastModified };
                            }
                        }
                    }
                } catch (e) {
                    // ignore read error
                }
            }

            // Merge user agent
            config.headers = { ...config.headers, 'User-Agent': 'AgentSkillsGenerator/1.0' };
            // Allow 304 to be passed as a valid status, or catch it
            config.validateStatus = (status: number) => (status >= 200 && status < 300) || status === 304;

            const response = await axios.get(cleanUrl, config);

            if (response.status === 304) {
                this.log(`Not modified: ${cleanUrl}`);
                return;
            }

            const contentType = response.headers['content-type'] || '';
            const isXml = cleanUrl.endsWith('.xml') || contentType.includes('xml') || contentType.includes('rss');
            const isHtml = contentType.includes('text/html');

            if (!isHtml && !isXml) {
                return;
            }

            const content = response.data;
            const links: string[] = [];

            if (isXml) {
                this.log(`Parsing XML feed: ${cleanUrl}`);
                const extraLinks = this.extractLinksFromXml(content);
                links.push(...extraLinks);
            } else {
                // Process HTML
                await this.processPage(cleanUrl, content, rule);

                // If subpaths are enabled, find links in HTML
                if (rule.subpaths) {
                    const $ = cheerio.load(content);
                    $('a[href]').each((_, el) => {
                        const href = $(el).attr('href');
                        if (href) {
                            try {
                                const absUrlObj = new URL(href, cleanUrl);
                                absUrlObj.hash = '';
                                const absoluteUrl = absUrlObj.toString();

                                const ruleUrl = rule.url.endsWith('/') ? rule.url.slice(0, -1) : rule.url;
                                const targetCheck = absoluteUrl.endsWith('/') ? absoluteUrl.slice(0, -1) : absoluteUrl;

                                if (targetCheck === ruleUrl || targetCheck.startsWith(ruleUrl + '/')) {
                                    links.push(absoluteUrl);
                                }
                            } catch (e) {
                                // ignore invalid URLs
                            }
                        }
                    });
                }
            }

            for (const link of links) {
                await this.visit(link, rule);
            }

        } catch (error: any) {
            this.log(`Error visiting ${cleanUrl}: ${error.message}`);
        }
    }

    private extractLinksFromXml(xmlContent: string): string[] {
        const found: string[] = [];
        try {
            if (typeof xmlContent === 'string' && (xmlContent.trim().startsWith('<?xml') || xmlContent.includes('<rss') || xmlContent.includes('<urlset') || xmlContent.includes('<feed'))) {
                const $ = cheerio.load(xmlContent, { xmlMode: true });

                // Sitemap: <url><loc>...</loc></url>
                $('loc').each((_, el) => {
                    const loc = $(el).text().trim();
                    if (loc) found.push(loc);
                });

                // RSS: <item><link>...</link></item>
                $('item > link').each((_, el) => {
                    const link = $(el).text().trim();
                    if (link) found.push(link);
                });

                // Atom: <entry><link href="..."/></entry>
                $('entry > link').each((_, el) => {
                    const href = $(el).attr('href');
                    if (href) found.push(href);
                });
            }
        } catch (e) { /* ignore */ }
        return found;
    }

    private shouldIgnore(url: string): boolean {
        for (const rule of this.config.rules) {
            if (rule.action === 'ignore') {
                // Exact match or prefix match for ignoring
                // A robust implementation would use minimatch/glob here
                if (url === rule.url || url.startsWith(rule.url)) {
                    return true;
                }
            }
        }
        return false;
    }

    private async processPage(url: string, html: string, rule: Rule) {
        const $ = cheerio.load(html);

        // Extract metadata
        const title = $('meta[property="og:title"]').attr('content') || $('title').text() || 'Untitled';
        const description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || 'No description available.';

        // Clean content
        // Similar to goquery logic: remove headers, toc, etc if possible.
        // This relies on generic selectors.
        $('header').remove();
        $('nav').remove();
        $('script').remove();
        $('style').remove();
        $('.toc').remove();

        // Extract main content - try specific selectors then fallback to body
        let contentHtml = '';
        if ($('article').length > 0) {
            contentHtml = $('article').html() || '';
        } else if ($('main').length > 0) {
            contentHtml = $('main').html() || '';
        } else {
            contentHtml = $('body').html() || '';
        }

        const markdown = this.turndownService.turndown(contentHtml);

        const name = this.sanitizeName(title);
        const saneDesc = this.sanitizeDescription(description);
        const lastModified = new Date().toUTCString(); // Simplification

        const frontmatter = `---
name: ${name}
description: ${saneDesc}
metadata:
  url: ${url}
  last_modified: ${lastModified}
---

# ${title}

`;
        const finalContent = frontmatter + markdown;

        await this.saveFile(url, finalContent, rule);
    }

    private getFilePath(urlStr: string, rule?: Rule): string {
        const urlObj = new URL(urlStr);
        const outputDir = path.join(this.rootPath, this.config.output);
        let finalPath = '';

        if (rule && rule.bundle) {
            // Bundle Logic (e.g. for Pub packages)
            // Root Rule URL -> Bundle Dir Name
            const ruleUrl = rule.url.endsWith('/') ? rule.url.slice(0, -1) : rule.url;
            const ruleObj = new URL(ruleUrl);

            // Consistent Bundle Name (Flat-ish style) based on Rule URL
            let bundleName = ruleObj.pathname;
            bundleName = bundleName.replace(/^\//, '').split('/').join('_');
            const cleanDomain = ruleObj.hostname.replace(/\./g, '_');
            const bundleDir = `${cleanDomain}_${bundleName}`;

            // Determine relative path within bundle
            // Ensure target URL is treated relative to Rule URL
            let targetPath = urlObj.pathname;
            let rulePath = ruleObj.pathname;

            // Normalize slashes
            if (!targetPath.endsWith('/')) targetPath += '/';
            if (!rulePath.endsWith('/')) rulePath += '/';

            let relative = '';
            if (targetPath.startsWith(rulePath)) {
                relative = targetPath.substring(rulePath.length);
            } else if (urlStr === ruleUrl) {
                relative = ''; // Root
            } else {
                // Fallback if something weird happens, treat as root or just name
                relative = urlObj.pathname.split('/').pop() || '';
            }

            // Cleanup relative path
            relative = relative.replace(/\/$/, '').replace(/^\//, '');

            if (!relative) {
                // Main Skill File
                const fileName = this.config.file_rename || 'SKILL.md';
                finalPath = path.join(outputDir, bundleDir, fileName);
            } else {
                // Reference File
                const refName = relative.replace(/\//g, '_') + '.md';
                finalPath = path.join(outputDir, bundleDir, 'references', refName);
            }

        } else if (this.config.flat) {
            // Flat logic: domain_path_to_file/SKILL.md
            let segment = urlObj.pathname;
            segment = segment.replace(/\.html$/, '');
            segment = segment.replace(/\/index$/, '');
            segment = segment.replace(/\/$/, '');
            segment = segment.replace(/^\//, '');
            segment = segment.replace(/%20/g, '_'); // simple sanity?
            segment = segment.split('/').join('_');

            const cleanDomain = urlObj.hostname.replace(/\./g, '_');
            const dirName = segment ? `${cleanDomain}_${segment}` : cleanDomain;

            const fileName = this.config.file_rename || 'SKILL.md';
            finalPath = path.join(outputDir, dirName, fileName);

        } else {
            // Hierarchical logic
            let filePath = urlObj.pathname;
            if (filePath.endsWith('/') || filePath === '') {
                filePath = path.join(filePath, 'index');
            }
            if (!path.extname(filePath)) {
                filePath += '.md';
            }

            if (this.config.file_rename) {
                const dir = path.join(outputDir, urlObj.hostname, path.dirname(filePath));
                finalPath = path.join(dir, this.config.file_rename);
            } else {
                finalPath = path.join(outputDir, urlObj.hostname, filePath);
                if (!finalPath.endsWith('.md')) { finalPath += '.md'; }
            }
        }
        return finalPath;
    }

    private async saveFile(urlStr: string, content: string, rule?: Rule) {
        const finalPath = this.getFilePath(urlStr, rule);
        const dir = path.dirname(finalPath);
        if (!this.fs.existsSync(dir)) {
            this.fs.mkdirSync(dir, { recursive: true });
        }

        this.fs.writeFileSync(finalPath, content);
    }

    private sanitizeName(s: string): string {
        s = s.toLowerCase();
        s = s.replace(/[^a-z0-9-]+/g, '-');
        s = s.replace(/^-+|-+$/g, '');
        if (s.length > 64) { s = s.substring(0, 64).replace(/-+$/, ''); }
        return s || 'untitled';
    }

    private sanitizeDescription(s: string): string {
        s = s.trim();
        if (!s) { return 'No description available.'; }
        if (s.length > 1024) { return s.substring(0, 1024) + '...'; }
        return s;
    }

}
