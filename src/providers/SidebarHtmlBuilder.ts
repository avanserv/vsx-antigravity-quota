import * as vscode from 'vscode'
import {getNonce} from '../utils'

export class SidebarHtmlBuilder {
    constructor(private readonly extensionUri: vscode.Uri) {}

    public getHtml(webview: vscode.Webview): string {
        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'reset.css'))
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'vscode.css'))
        const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css'))
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar.js'))

        const nonce = getNonce()
        const chevronUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'chevron.svg'))
        const pinFilledUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'pin-filled.svg'))
        const pinSolidUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'pin-solid.svg'))
        const pinOutlineUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'pin-outline.svg'))


        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Antigravity Quota</title>
                <link href="${styleResetUri}" rel="stylesheet">
                <link href="${styleVSCodeUri}" rel="stylesheet">
                <link href="${styleMainUri}" rel="stylesheet">
                <style>
                    body { font-family: var(--vscode-font-family); padding: 16px; box-sizing: border-box; }
                    .card { 
                        background: var(--vscode-sideBar-background); 
                        border: 1px solid var(--vscode-widget-border); 
                        padding: 16px; 
                        margin-bottom: 16px; 
                        border-radius: 6px; 
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    }
                    .model-card {
                        border-left: 4px solid var(--vscode-button-background);
                    }
                    .header { font-weight: 600; font-size: 1.1em; margin-bottom: 12px; }
                    
                    .tag {
                        background: var(--vscode-badge-background);
                        color: var(--vscode-badge-foreground);
                        padding: 2px 6px;
                        border-radius: 3px;
                        font-size: 0.85em;
                        display: inline-block;
                        margin-right: 4px;
                    }
                    .model-tags { margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 6px; }
                    .model-tag { 
                        background: var(--vscode-editor-background); 
                        border: 1px solid var(--vscode-widget-border);
                        padding: 4px 8px; 
                        border-radius: 4px;
                        font-weight: 500;
                    }

                    .progress-section { margin-top: 8px; }
                    .flex-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.9em; opacity: 0.9; }
                    
                    .progress-track {
                        background: var(--vscode-editor-background);
                        height: 8px;
                        border-radius: 4px;
                        width: 100%;
                        overflow: hidden;
                    }
                    .progress-fill {
                        height: 100%;
                        background: var(--vscode-charts-green);
                        transition: width 0.5s ease;
                    }
                    .progress-fill.danger { background: var(--vscode-charts-red); }
                    .progress-fill.warning { background: var(--vscode-charts-orange); }
                    
                    /* Bar chart colors */
                    .bar.danger { background: var(--vscode-charts-red); }
                    .bar.warning { background: var(--vscode-charts-orange); }
                    .bar.success { background: var(--vscode-charts-green); }

                    .reset-time {
                        margin-top: 8px;
                        font-size: 0.8em;
                        opacity: 0.7;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    }
                    
                    .refresh-btn { 
                        background: var(--vscode-button-secondaryBackground); 
                        color: var(--vscode-button-secondaryForeground); 
                        border: none; padding: 8px 16px; cursor: pointer; width: 100%; 
                        border-radius: 4px;
                        font-weight: 500;
                        margin-bottom: 8px; 
                    }
                    .refresh-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }

                    .debug-btn {
                        background: var(--vscode-button-background); 
                        color: var(--vscode-button-foreground); 
                        border: none; padding: 8px 16px; cursor: pointer; width: 100%; 
                        border-radius: 4px;
                        font-weight: 500;
                        opacity: 0.8;
                    }
                    .debug-btn:hover { opacity: 1.0; }
                    
                    .mb-1 { margin-bottom: 4px; }
                    .mb-2 { margin-bottom: 8px; }
                    .p-3 { padding: 12px; }

                    /* History Graph */
                    .history-card {
                        margin-top: 16px;
                    }
                    .tabs {
                        display: flex;
                        gap: 8px;
                        margin-bottom: 12px;
                        border-bottom: 1px solid var(--vscode-widget-border);
                        padding-bottom: 8px;
                    }
                    .tab {
                        cursor: pointer;
                        padding: 4px 8px;
                        border-radius: 4px;
                        opacity: 0.6;
                        font-size: 0.9em;
                    }
                    .tab:hover { opacity: 0.8; background: var(--vscode-toolbar-hoverBackground); }
                    .tab.active {
                        opacity: 1;
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }
                    
                    .graph-container {
                        height: 100px;
                        display: flex;
                        align-items: flex-end;
                        gap: 2px;
                        padding-top: 10px;
                        border-bottom: 1px solid var(--vscode-widget-border);
                    }
                    .bar-wrapper {
                        flex: 1;
                        height: 100%;
                        display: flex;
                        align-items: flex-end;
                        justify-content: center;
                        background: var(--vscode-scrollbarSlider-background);
                        border-radius: 2px 2px 0 0;
                        min-width: 2px;
                    }
                    .bar {
                        width: 100%;
                        background: var(--vscode-progressBar-background);
                        border-radius: 1px 1px 0 0;
                        transition: height 0.3s ease;
                        opacity: 1;
                    }
                    .bar-wrapper:hover {
                         filter: brightness(1.1);
                    }
                    .stats-row {
                        display: flex;
                        justify-content: space-between;
                        font-size: 0.8em;
                        opacity: 0.7;
                        margin-top: 4px;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <span>Model Usage</span>
                </div>
                
                <div id="credits-container"></div>
                
                <div id="history-container">
                    <!-- History and controls will be injected here -->
                </div>

                <div id="models-list">
                    <div style="text-align:center; padding: 20px; opacity: 0.7;">
                        Loading quota information...
                    </div>
                </div>
                
                <div style="margin-top: 16px;">
                    <button class="refresh-btn" id="refresh-btn">Refresh</button>
                    <button class="debug-btn" id="debug-btn">Debug JSON</button>
                </div>
                
                <script nonce="${nonce}">
                    window.viewConfig = {
                        chevronUri: "${chevronUri}",
                        pinFilledUri: "${pinFilledUri}",
                        pinSolidUri: "${pinSolidUri}",
                        pinOutlineUri: "${pinOutlineUri}"
                    };
                </script>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`
    }
}
