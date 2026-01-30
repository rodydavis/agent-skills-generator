# Agent Skills Generator

**Generate Markdown documentation skills for AI agents by crawling websites.**

Agent Skills Generator is a VS Code extension that allows you to easily crawl documentation websites and convert them into clean, structured Markdown files. These files are optimized for use as "skills" or knowledge bases for AI agents, enabling them to understand and use new libraries or tools effectively.

## Features

### 🕷️ Rules Engine
Define powerful crawling rules to target the exact content you need:
- **URL Pattern**: Use glob patterns to match specific documentation pages (e.g., `https://example.com/docs/**`).
- **Selector**: improved content extraction by specifying a CSS selector for the main content area (e.g., `main`, `article`, `.content`).

### 📂 Customizable Output
Tailor the generated files to your project structure:
- **Output Directory**: choose where the skills are saved.
- **Flat Structure**: option to flattening the folder hierarchy or preserve the website's structure.
- **File Naming**: customize the filename for the main skill entry point.

### 🔄 Import / Export Configuration
- Easily share your crawling configuration with your team or across projects using the built-in JSON import/export feature.

### 📦 Dependency Auto-Crawling
- Automatically crawl documentation for your project's direct-dependencies.
- Supports `package.json` (NPM), `pubspec.yaml` (Pub), and `go.mod` (Go).
- Generates version-specific URLs to ensure documentation matches your installed packages.

### 🔍 Sitemap & RSS Discovery
- Automatically discovers pages via `sitemap.xml`, `robots.txt`, and RSS/Atom feeds.
- Smartly avoids re-scanning the same domain to be efficient.

## Usage

1.  **Open the Generator**: Click on the **Agent Skills** icon in the Activity Bar.
2.  **Configure**: Set your desired **Output Directory** (default: `.agents/skills`).
3.  **Add a Rule**:
    - Click **+ Add Rule**.
    - Enter the **URL Pattern** for the documentation site.
    - (Optional) specific a CSS **Selector** to isolate the documentation content.
4.  **Fetch Skills**: Click the **Fetch Skills** button at the bottom.
5.  **Wait**: The extension will crawl the pages and generate the Markdown files. You'll see a notification when it's done.

## Extension Settings

This extension contributes the following settings usage via the UI:

*   **Output Directory**: The local folder where generated Markdown files will be saved.
*   **Flat Structure**: If enabled, all files are saved in a single directory (collisions handled). If disabled, the URL path structure is preserved.
*   **Rename File**: The name of the main skill file (default: `SKILL.md`).

## Requirements

No external dependencies are required to run this extension.

## Known Issues

- Complex interactions (like SPAs that require heavy JS execution) might have limited support depending on the crawler's capabilities.

## Release Notes

### 0.0.3
- Added Dependency Auto-Crawling (NPM, Pub, Go).
- Added Sitemap and RSS/Atom feed discovery.
- Improved crawling efficiency.

### 0.0.2
- Added incremental crawling support.
- Fixed URL handling for paths without trailing slashes.
- Added unit tests.

### 0.0.1
- Initial release.
- Basic crawling functionality with `turndown` for HTML-to-Markdown conversion.
- Configuration UI with Import/Export support.
