import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

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
}

export class Crawler {
    private visited = new Set<string>();
    private config: Config;
    private rootPath: string;
    private turndownService: TurndownService;
    private _onProgress?: (msg: string) => void;

    constructor(rootPath: string, config: Config) {
        this.rootPath = rootPath;
        this.config = config;
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

        if (this.visited.has(cleanUrl)) return;

        // Basic check for ignore rules
        if (this.shouldIgnore(cleanUrl)) {
            this.log(`Ignoring: ${cleanUrl}`);
            return;
        }

        this.visited.add(cleanUrl);
        this.log(`Visiting: ${cleanUrl}`);

        try {
            const response = await axios.get(cleanUrl, {
                headers: { 'User-Agent': 'AgentSkillsGenerator/1.0' }
            });

            const contentType = response.headers['content-type'];
            if (!contentType || !contentType.includes('text/html')) {
                return;
            }

            const html = response.data;
            await this.processPage(cleanUrl, html);

            // If subpaths are enabled, find links
            if (rule.subpaths) {
                const $ = cheerio.load(html);
                const links: string[] = [];
                $('a[href]').each((_, el) => {
                    const href = $(el).attr('href');
                    if (href) {
                        try {
                            const absUrlObj = new URL(href, cleanUrl);
                            absUrlObj.hash = ''; // Strip hash from extracted links
                            const absoluteUrl = absUrlObj.toString();

                            // Basic scope check: must start with the rule URL (simple subpath logic)
                            // Note: This is a simplified version of the Go gobwas/glob logic.
                            // For strict parity we'd need a glob matcher or exact prefix check.
                            // Here we enforce it must be under the rule base URL
                            if (absoluteUrl.startsWith(rule.url)) {
                                links.push(absoluteUrl);
                            }
                        } catch (e) {
                            // ignore invalid URLs
                        }
                    }
                });

                for (const link of links) {
                    await this.visit(link, rule);
                }
            }

        } catch (error: any) {
            this.log(`Error visiting ${cleanUrl}: ${error.message}`);
        }
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

    private async processPage(url: string, html: string) {
        const $ = cheerio.load(html);

        // Extract metadata
        let title = $('meta[property="og:title"]').attr('content') || $('title').text() || 'Untitled';
        let description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || 'No description available.';

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

        await this.saveFile(url, finalContent);
    }

    private async saveFile(urlStr: string, content: string) {
        const urlObj = new URL(urlStr);
        const outputDir = path.join(this.rootPath, this.config.output);
        let finalPath = '';

        if (this.config.flat) {
            // Flat logic: domain_path_to_file/SKILL.md
            let segment = urlObj.pathname;
            segment = segment.replace(/\.html$/, '');
            segment = segment.replace(/\/index$/, '');
            segment = segment.replace(/\/$/, '');
            segment = segment.replace(/^\//, '');
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
                filePath += '.md'; // Default to md if not doing specific rename per file?
                // The Go code handles extensions a bit differently for hierarchical.
                // Here we simplify:
            }
            // For hierarchical with rename, it usually means rename the leaf? 
            // The Go CLI applies rename to the output file.

            if (this.config.file_rename) {
                // This is tricky for hierarchical. Go code:
                // mdPath = filepath.Join(filepath.Dir(fullPath), fileRename)
                const dir = path.join(outputDir, urlObj.hostname, path.dirname(filePath));
                finalPath = path.join(dir, this.config.file_rename);
            } else {
                // Just append .md to html path?
                // Keeping simple for now to match flat preference
                finalPath = path.join(outputDir, urlObj.hostname, filePath);
                if (!finalPath.endsWith('.md')) finalPath += '.md';
            }
        }

        const dir = path.dirname(finalPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(finalPath, content);
    }

    private sanitizeName(s: string): string {
        s = s.toLowerCase();
        s = s.replace(/[^a-z0-9-]+/g, '-');
        s = s.replace(/^-+|-+$/g, '');
        if (s.length > 64) s = s.substring(0, 64).replace(/-+$/, '');
        return s || 'untitled';
    }

    private sanitizeDescription(s: string): string {
        s = s.trim();
        if (!s) return 'No description available.';
        if (s.length > 1024) return s.substring(0, 1024) + '...';
        return s;
    }

}
