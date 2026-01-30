# Change Log

All notable changes to the "agent-skills-generator" extension will be documented in this file.

## [0.0.4]

- Added **Skill Bundling** for Pub packages:
    - Main package page is saved as `SKILL.md`.
    - Sub-pages (like Changelog, Example, Install) are organized into a `references/` subdirectory to keep the main skill clean.
- **Strict Sitemap Crawling**:
    - Auto-discovery of sitemaps from HTML pages is now disabled to reduce noise.
    - Sitemaps/RSS feeds are only parsed if the URL explicitly ends in `.xml` or has an XML content type.

## [0.0.3]

- Added **Dependency Auto-Crawling** feature:
    - Automatically discovers direct dependencies from `package.json` (NPM), `pubspec.yaml` (Pub), and `go.mod` (Go).
    - Generates version-specific URLs for documentation.
    - Includes logic to skip `sdk`, `path`, and `git` dependencies for Pub.
    - Added "Crawl Dependencies" setting to toggle this feature.
- Added **Sitemap and RSS Discovery**:
    - Automatically discovers links from `sitemap.xml`, `robots.txt`, and RSS/Atom feeds.
    - Prevents redundant scanning of domains.

## [0.0.2]

-   **Incremental Crawling**: Added support for `If-Modified-Since` headers to avoid re-fetching unchanged content.
-   **Robuster URL Handling**: Improved support for URLs without trailing slashes and stricter subpath matching.
-   **Tests**: Added implementation of unit tests for the crawler.

## [0.0.1]

-   Initial release
