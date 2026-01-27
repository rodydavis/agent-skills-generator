# Agent Skills Generator

Convert documentation websites into Markdown skills optimized for AI agents and LLMs.

This repository contains two projects:
1. **VS Code Extension**: A GUI-based tool to manage and generate skills directly within VS Code.
2. **Go CLI**: A robust command-line tool for high-performance crawling and generation.

---

## 1. VS Code Extension

Code located in [`vscode-extension/`](./vscode-extension).

A Visual Studio Code extension that provides a dedicated "Agent Skills" side panel to manage your crawling rules and generate skills.

### Features
*   **Visual Rule Management**: Add, edit, and delete URL patterns via a clean UI.
*   **One-Click Generation**: Fetch skills directly from VS Code.
*   **State Persistence**: Rules and settings are saved between sessions.
*   **Import/Export**: Share configurations via JSON files.
*   **Configurable**: Set output directory, file naming, and structure preferences.

### Installation

1. Clone this repository.
2. Open the `vscode-extension` folder in VS Code.
3. Run `npm install` to install dependencies.
4. Press `F5` to start the extension in a debug window.

### Usage
1. Open the **Agent Skills** view in the Activity Bar.
2. Add URL patterns (e.g., `https://docs.flutter.dev/`).
3. Configure **Include/Ignore** and **Subpaths**.
4. Click **Fetch Skills**.

---

## 2. Go CLI

Code located in [`go-cli/`](./go-cli).

A high-performance CLI tool written in Go for recursive crawling and Markdown conversion.

### Features
*   **Recursive Crawling**: Configurable depth and filtering.
*   **HTML to Markdown**: Clean conversion optimized for token efficiency.
*   **Metadata Extraction**: Frontmatter with original URL, title, and dates.
*   **Flat Storage**: Option to save as flat structures for RAG compatability.

### Installation

```bash
cd go-cli
go build -o agent-skills-generator main.go
```

### Usage

**Basic Crawl:**
```bash
./agent-skills-generator crawl --config skills.yaml
```

**Configuration (`skills.yaml`):**
```yaml
output: .agent/skills
flat: true
rules:
  - url: "https://docs.flutter.dev/"
    subpaths: true
    action: "include"
```

For full CLI documentation, see [`go-cli/README.md`](./go-cli/README.md).
