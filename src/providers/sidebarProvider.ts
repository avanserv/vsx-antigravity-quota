import * as vscode from 'vscode'
import {UserStatus, UsageEntry} from '../models/types'
import {LanguageServerService} from '../services/LanguageServerService'
import {HistoryService} from '../services/HistoryService'
import {SidebarHtmlBuilder} from './SidebarHtmlBuilder'

export class SidebarProvider implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView
    _currentPeriod: 'hour' | 'day' | 'week' = 'hour'
    _currentCategory: string = 'All'
    private _lastData?: UserStatus
    private readonly htmlBuilder: SidebarHtmlBuilder

    constructor(private readonly _context: vscode.ExtensionContext) {
        this.htmlBuilder = new SidebarHtmlBuilder(_context.extensionUri)
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri],
        }

        webviewView.webview.html = this.htmlBuilder.getHtml(webviewView.webview)

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'refresh': {
                    await this.refresh()
                    break
                }
                case 'setPeriod': {
                    this._currentPeriod = data.value
                    await this.refresh()
                    break
                }
                case 'setCategory': {
                    this._currentCategory = data.value
                    await this.refresh()
                    break
                }
                case 'togglePin': {
                    vscode.commands.executeCommand('antigravity-quota.togglePin', data.value)
                    break
                }
                case 'debug': {
                    const content = JSON.stringify(data.value, null, 2)
                    const doc = await vscode.workspace.openTextDocument({
                        content: content,
                        language: 'json',
                    })
                    await vscode.window.showTextDocument(doc)
                    break
                }
                case 'ready': {
                    await this.refresh()
                    break
                }
            }
        })
    }

    public async refresh(forceFetch: boolean = true): Promise<UserStatus | undefined> {
        try {
            let data: UserStatus

            if (forceFetch || !this._lastData) {
                data = await LanguageServerService.fetchUserStatusFromAnyCandidate()
                this._lastData = data

                // Update history only on fresh fetch
                await HistoryService.updateUsageHistory(this._context, data)
            } else {
                data = this._lastData
            }

            // Get aggregated history for each category
            const categories = ['Gemini Pro', 'Gemini Flash', 'Claude', 'GPT', 'Other']
            const histories: {[key: string]: UsageEntry[]} = {}

            histories['All'] = HistoryService.getAggregatedHistory(this._context, this._currentPeriod, 'All')

            for (const cat of categories) {
                histories[cat] = HistoryService.getAggregatedHistory(this._context, this._currentPeriod, cat)
            }

            const pinnedGroups: string[] = this._context.globalState.get('antigravity.pinnedGroups', [])

            if (this._view) {
                this._view.webview.postMessage({
                    type: 'data',
                    value: {
                        userStatus: data,
                        histories: histories,
                        period: this._currentPeriod,
                        pinnedGroups: pinnedGroups,
                    },
                })
            }

            return data
        } catch (error) {
            if (this._view) {
                this._view.webview.postMessage({
                    type: 'error',
                    value: error instanceof Error ? error.message : String(error),
                })
            }
            return undefined
        }
    }
}
