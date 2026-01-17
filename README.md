# Agent Skills Generator

A CLI tool to crawl documentation websites and convert them into Markdown files optimized for agentic skills (LLM context).

## Features

*   **Recursive Crawling**: Crawls a website based on allowed and ignored glob patterns.
*   **HTML to Markdown**: Converts HTML content to clean Markdown, removing navigation and extraneous elements.
*   **Flat Storage**: Option to save files in a flat directory structure (`domain_path_to_file/index.md`) for easier RAG ingestion.
*   **Metadata Extraction**: Extracts title, description, URL, and Last-Modified date into frontmatter.
*   **Incremental Crawling**: Checks `Last-Modified` headers to avoid re-downloading unchanged content.
*   **Configurable**: Supports YAML configuration for rules, output directory, and renaming.
*   **Filtering**: Strict domain and path filtering using glob patterns.

## Installation

```bash
git clone https://github.com/rodydavis/agent-skills-generator.git
cd agent-skills-generator
go build -o agent-skills-generator main.go
```

## Usage

```bash
./agent-skills-generator [command] [flags]
```

### Crawl

Crawl a website using a configuration file (default `.skillscontext`).

```bash
./agent-skills-generator crawl --config .skillscontext
```

#### Flags

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--config` | Path to the configuration file | `.skillscontext` |
| `--output` | Directory to save crawled content | `.skillscache` |
| `--flat` | Use flat directory structure (recommended for easy consumption) | `false` |

### Clean

Remove the output directory (default `.skillscache`).

```bash
./agent-skills-generator clean
```

### Configuration (`.skillscontext`)

Create a `.skillscontext` file with a list of URL patterns to include or exclude.
- Use `*` as a wildcard.
- Prefix with `!` to exclude patterns.

**Example:**

```
# Include all pages under docs.flutter.dev
https://docs.flutter.dev/*

# Exclude specific sub-paths
!https://docs.flutter.dev/release/breaking-changes/*

# Include a single specific page
https://dart.dev/guides/language/effective-dart/style
```

### Examples

**Basic Crawl:**
```bash
go run main.go crawl
```

**Flat Output (Folder-per-Page):**
```bash
go run main.go crawl --flat
```
This will create a directory for each page (e.g., `docs_flutter_dev_install`) containing `index.html` and `index.md`.

**Custom Config and Output:**
```bash
go run main.go crawl --config my-urls.txt --output my-cache
```

### Clean Command

Use the `clean` command to remove the output directory before a fresh crawl.

```bash
# Clean the default .skillscache directory
go run main.go clean

# Clean a custom output directory
go run main.go clean --output my-cache
```

### Configuration File (`skills.yaml`)

You can also use a `skills.yaml` file to define command arguments and rules (both verbose and inline).

```bash
./agent-skills-generator crawl --config skills.yaml
```:**

```yaml
output: .skillscache
flat: true
config: .skillscontext # Optional external file

# Inline patterns (list of strings)
patterns:
  - "https://docs.flutter.dev/*"
  - "!https://docs.flutter.dev/release/*"

# Verbose rules (list of objects)
rules:
  # Visit all pages under this path (implicitly adds /*)
  - url: "https://dart.dev/language/collections"
    subpaths: true
    action: "include"

  # Ignore this specific page
  - url: "https://dart.dev/language/collections/iterables"
    action: "ignore"

# Optional: Rename output Markdown files
file_rename: "SKILL.md"
```
Arguments passed via CLI flags will take precedence over values in `skills.yaml`.

## Example

Flutter, Dart, Firebase and signals docs added as agent skills in Antigravity:

```yaml
output: .agent/skills
flat: true
file_rename: SKILL.md
patterns:
  - "https://docs.flutter.dev/*"
  - "!https://docs.flutter.dev/release/breaking-changes/*"
  - "!https://docs.flutter.dev/release/release-notes/*"
  - "https://dart.dev/*"
  - "!https://codelabs.developers.google.com/*"
  - "!https://dart.dev/tools/diagnostics/*"
  - "!https://docs.flutter.dev/tools/devtools/release-notes/*"
  - "!https://dart.dev/tools/linter-rules/*"
  - "https://dartsignals.dev/*"
  - "https://firebase.google.com/docs/app-hosting/*"
  - "https://firebase.google.com/docs/hosting/*"
```
