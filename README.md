# Quantum Star

A new Golang CLI project.

## CLI Usage

Run the crawler using the `crawl` command:

```bash
go run main.go crawl [flags]
```

### Flags

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--config` | Path to the configuration file | `.skillscontext` |
| `--output` | Directory to save crawled content | `.skillscache` |
| `--flat` | Use flat directory structure (recommended for easy consumption) | `false` |

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

You can create a `skills.yaml` file in the current directory to set default values for flags.

**Example `skills.yaml`:**

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
