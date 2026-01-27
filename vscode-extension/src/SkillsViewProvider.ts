import * as vscode from 'vscode';
import { Crawler } from './crawler/Crawler';

export class SkillsViewProvider implements vscode.WebviewViewProvider {

    public static readonly viewType = 'agent-skills-view';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext,
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Restore state on load - this logic is now moved to 'webviewReady' message handler
        // const savedState = this._context.workspaceState.get('skillsConfig');
        // if (savedState) {
        //     webviewView.webview.postMessage({ type: 'updateState', state: savedState });
        // }

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'webviewReady': {
                    const savedState = this._context.workspaceState.get('skillsConfig');
                    if (savedState) {
                        webviewView.webview.postMessage({ type: 'updateState', state: savedState });
                    }
                    break;
                }
                case 'runCrawl': {
                    await this.runCrawl(data.config);
                    break;
                }
                case 'saveState': {
                    await this._context.workspaceState.update('skillsConfig', data.state);
                    break;
                }
                case 'exportConfig': {
                    await this.exportConfig(data.state);
                    break;
                }
                case 'importConfig': {
                    await this.importConfig();
                    break;
                }
            }
        });
    }

    private async exportConfig(state: any) {
        const fileUri = await vscode.window.showSaveDialog({
            saveLabel: 'Export Config',
            filters: {
                'JSON': ['json']
            },
            defaultUri: vscode.Uri.file('agent-skills.json')
        });

        if (fileUri) {
            const content = JSON.stringify(state, null, 2);
            await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(content));
            vscode.window.showInformationMessage('Configuration exported successfully.');
        }
    }

    private async importConfig() {
        const fileUris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Import Config',
            filters: {
                'JSON': ['json']
            }
        });

        if (fileUris && fileUris[0]) {
            try {
                const fileData = await vscode.workspace.fs.readFile(fileUris[0]);
                const jsonContent = Buffer.from(fileData).toString('utf8');
                const state = JSON.parse(jsonContent);

                // Update extension state
                await this._context.workspaceState.update('skillsConfig', state);

                // Update UI
                if (this._view) {
                    this._view.webview.postMessage({ type: 'updateState', state: state });
                }
                vscode.window.showInformationMessage('Configuration imported successfully.');
            } catch (e: any) {
                vscode.window.showErrorMessage(`Failed to import config: ${e.message}`);
            }
        }
    }

    private async runCrawl(config: any) {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }
        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Generating Skills...",
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                console.log("User canceled the long running operation");
            });

            const crawler = new Crawler(rootPath, config);

            crawler.onProgress((msg: string) => {
                progress.report({ message: msg });
            });

            try {
                await crawler.crawl();

                // Update state with lastFetched
                const newState = { ...config, lastFetched: Date.now() };
                await this._context.workspaceState.update('skillsConfig', newState);

                // Notify UI to update
                if (this._view) {
                    this._view.webview.postMessage({ type: 'updateState', state: newState });
                }

                vscode.window.showInformationMessage('Skills generation complete!');
            } catch (error: any) {
                vscode.window.showErrorMessage(`Error generating skills: ${error.message}`);
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'codicon.css'));

        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${styleUri}" rel="stylesheet">
        <link href="${codiconsUri}" rel="stylesheet">
				<title>Agent Skills</title>
			</head>
			<body>
        <div class="container">
          <!-- Header Actions -->
          <div class="header-actions">
              <button id="import-btn" class="icon-btn" title="Import Config">Import</button>
              <button id="export-btn" class="icon-btn" title="Export Config">Export</button>
          </div>

          <div class="section">
              <h3>Settings</h3>
              <div class="form-group">
                <label>Output Directory</label>
                <input type="text" id="output-dir" value=".agents/skills" placeholder=".agents/skills" />
              </div>
              <div class="form-group row">
                 <div class="checkbox-container">
                    <input type="checkbox" id="flat-structure" checked />
                    <label for="flat-structure">Flat Structure</label>
                 </div>
              </div>
               <div class="form-group">
                    <label>Rename File</label>
                    <input type="text" id="file-rename" value="SKILL.md" placeholder="SKILL.md" />
                 </div>
          </div>

          <div class="section">
              <div class="section-header">
                <h3>Rules</h3>
                <button id="add-rule-btn" class="small-btn secondary">+ Add Rule</button>
              </div>
              <div id="rules-list"></div>
          </div>
          
          <div class="footer-actions">
            <button id="crawl-btn" class="primary-btn">Fetch Skills</button>
          </div>
        </div>
				<script src="${scriptUri}"></script>
			</body>
			</html>`;
    }
}
