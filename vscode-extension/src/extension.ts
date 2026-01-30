import * as vscode from 'vscode';
import { SkillsViewProvider } from './SkillsViewProvider';

export function activate(context: vscode.ExtensionContext) {
    const provider = new SkillsViewProvider(context.extensionUri, context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SkillsViewProvider.viewType, provider)
    );
}

export function deactivate() {
    // No clean up needed
}
