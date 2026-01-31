import * as vscode from 'vscode'
import {SidebarProvider} from './providers/sidebarProvider'
import {StatusBarManager} from './managers/StatusBarManager'

export function activate(context: vscode.ExtensionContext) {
    console.log('Antigravity Quota Extension is active!')

    const sidebarProvider = new SidebarProvider(context)
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('antigravity-quota-sidebar', sidebarProvider))

    const statusBarManager = new StatusBarManager(context)
    statusBarManager.registerHelperCommands()

    const refreshCommandId = 'antigravity-quota.refresh'
    const showDetailsCommandId = 'antigravity-quota.showDetails'

    context.subscriptions.push(
        vscode.commands.registerCommand(refreshCommandId, () => {
            sidebarProvider.refresh().then((data) => {
                if (data) statusBarManager.updateWidgets(data)
            })
        })
    )

    context.subscriptions.push(
        vscode.commands.registerCommand(showDetailsCommandId, async () => {
            await vscode.commands.executeCommand('antigravity-quota-sidebar.focus')
        })
    )

    // Initial Refresh
    sidebarProvider.refresh().then((data) => {
        if (data) statusBarManager.updateWidgets(data)
    })

    // Refresh every 60 seconds (1 minute)
    const interval = setInterval(() => {
        sidebarProvider.refresh().then((data) => {
            if (data) statusBarManager.updateWidgets(data)
        })
    }, 60 * 1000)
    context.subscriptions.push(new vscode.Disposable(() => clearInterval(interval)))
}

export function deactivate() {}
