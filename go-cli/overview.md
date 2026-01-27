# Agent Skills Generator Overview

The **Agent Skills Generator** is a CLI tool written in Go designed to crawl documentation websites and convert them into Markdown files. These files are optimized for use as "skills" or knowledge bases for AI agents.

## How It Works

The tool functions as a web crawler that:
1.  **Crawls** specific websites based on allowed patterns.
2.  **Extracts** the main content from the HTML, removing clutter like tables of contents and headers.
3.  **Converts** the HTML content to Markdown.
4.  **Generates** files with YAML frontmatter containing metadata (name, description, URL, last modified date).
5.  **Saves** the output in a structured or flat directory format.

## Architecture

The project is built using the following key libraries:
*   **[Cobra](https://github.com/spf13/cobra)**: For the CLI interface and command management.
*   **[Viper](https://github.com/spf13/viper)**: For configuration management (handling flags and config files).
*   **[Colly](https://github.com/gocolly/colly)**: For web crawling and scraping.
*   **[Goquery](https://github.com/PuerkitoBio/goquery)**: For HTML parsing and DOM manipulation (similar to jQuery).
*   **[HTML to Markdown](https://github.com/JohannesKaufmann/html-to-markdown)**: For converting the scraped HTML into Markdown.

### Code Structure

*   **`main.go`**: The entry point ensuring the `cmd` package is executed.
*   **`cmd/root.go`**: Defines the root command, global flags (config, output, flat, rename), and Viper bindings.
*   **`cmd/crawl.go`**: Contains the core logic:
    *   Loads rules (allowed/ignored globs) from the config.
    *   Configures the `colly` collector (async, parallelism).
    *   Handles HTML parsing (`goquery`) to extract title, description, and content.
    *   Converts content to Markdown.
    *   Writes the final file with frontmatter.
*   **`cmd/clean.go`**: Implements the `clean` command to wipe the output directory.
*   **`cmd/config.go`**: Defines configuration structs for parsing the YAML config file.

## Usage

### Commands

*   **`crawl`** (Default): runs the crawler.
*   **`clean`**: Removes the output directory.

### Flags

*   `--config`: Config file path (default: `.skillscontext`).
*   `--output`: Output directory (default: `.skillscache`).
*   `--flat`: Save files in a flat directory structure (default: `false`).
*   `--rename`: Rename the output markdown file (e.g., `SKILL.md`).

### Configuration

The tool uses a YAML configuration file (e.g., `skills.yaml`) to define crawling rules.

**Example `skills.yaml`:**
```yaml
output: ".skillscache"
flat: false
patterns:
  - "https://example.com/docs/*"
rules:
  - url: "https://example.com/docs/api/*"
    action: "ignore"
```

## Output Format

Generated Markdown files include YAML frontmatter:

```markdown
---
name: documentation-title
description: A brief description of the page content.
metadata:
  url: https://example.com/docs/page
  last_modified: Mon, 02 Jan 2006 15:04:05 GMT
---

# Page Title

[Markdown content...]
```
