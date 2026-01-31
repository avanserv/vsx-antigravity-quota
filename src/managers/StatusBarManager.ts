import * as vscode from 'vscode'
import {UserStatus, QuotaInfo} from '../models/types'
import {getModelCategory} from '../utils'
import {HistoryService} from '../services/HistoryService'

export class StatusBarManager {
    private static readonly PINNED_GROUPS_KEY = 'antigravity.pinnedGroups'
    private widgetMap = new Map<string, vscode.StatusBarItem>()

    constructor(private readonly context: vscode.ExtensionContext) {}

    public registerHelperCommands() {
        const togglePinCommandId = 'antigravity-quota.togglePin'
        this.context.subscriptions.push(
            vscode.commands.registerCommand(togglePinCommandId, async (groupName: string) => {
                const currentPins: string[] = this.context.globalState.get(StatusBarManager.PINNED_GROUPS_KEY, [])
                let newPins = [...currentPins]

                if (currentPins.includes(groupName)) {
                    newPins = newPins.filter((g) => g !== groupName)
                    // Remove widget immediately
                    const widget = this.widgetMap.get(groupName)
                    if (widget) {
                        widget.dispose()
                        this.widgetMap.delete(groupName)
                    }
                } else {
                    newPins.push(groupName)
                }

                await this.context.globalState.update(StatusBarManager.PINNED_GROUPS_KEY, newPins)

                // Note: Caller is responsible for triggering a refresh if needed, usually via the SidebarProvider logic or commands
                // But we can trigger a command that the main extension listens to, or just export a refresh method that accepts data.
                // For now, let's assume the refresh flow happens elsewhere or we just wait for the next cycle.
                // Actually, the original code had: sidebarProvider.refresh(false).then...
                // We'll leave that coordination to the Extension wrapper for now or trigger a refresh command.
                vscode.commands.executeCommand('antigravity-quota.refresh')
            })
        )
    }

    public updateWidgets(data: UserStatus) {
        const pinned: string[] = this.context.globalState.get(StatusBarManager.PINNED_GROUPS_KEY, [])
        const models = data?.userStatus?.cascadeModelConfigData?.clientModelConfigs || []

        // Clean up unpinned widgets
        for (const [group, widget] of this.widgetMap) {
            if (!pinned.includes(group)) {
                widget.dispose()
                this.widgetMap.delete(group)
            }
        }

        // Create/Update widgets for pinned groups
        pinned.forEach((groupName) => {
            let widget = this.widgetMap.get(groupName)
            if (!widget) {
                widget = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
                widget.command = 'antigravity-quota.showDetails'
                this.widgetMap.set(groupName, widget)
                this.context.subscriptions.push(widget)
            }

            this.updateGroupWidget(widget, groupName, models)
            widget.show()
        })
    }

    private updateGroupWidget(widget: vscode.StatusBarItem, groupName: string, models: QuotaInfo[]) {
        // Filter models belonging to this group
        const groupModels = models.filter((m) => {
            const label = m.label || m.modelOrAlias?.model || 'Unknown'
            return getModelCategory(label) === groupName
        })

        if (groupModels.length === 0) {
            widget.text = `$(warning) ${groupName}: N/A`
            return
        }

        // Find lowest quota in this group to represent the group
        let selectedModel = groupModels[0]
        let lowestFraction = 1.0

        groupModels.forEach((m) => {
            const f = m.quotaInfo?.remainingFraction ?? 1.0
            if (f < lowestFraction) {
                lowestFraction = f
                selectedModel = m
            }
        })

        const fraction = selectedModel.quotaInfo?.remainingFraction ?? 1.0
        const percent = Math.floor(fraction * 100)

        // Icon logic
        let icon = '$(check)'
        if (fraction <= 0.2) icon = '$(alert)'
        else if (fraction <= 0.5) icon = '$(pulse)'

        // Color logic
        if (fraction <= 0.2) {
            widget.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
        } else {
            widget.backgroundColor = undefined
        }

        widget.text = `${icon} ${groupName}: ${percent}%`

        let tooltip = `${groupName} Quota\n\n`

        // Sort models: lowest quota first
        groupModels.sort((a, b) => (a.quotaInfo?.remainingFraction ?? 1) - (b.quotaInfo?.remainingFraction ?? 1))

        groupModels.forEach((m) => {
            const mLabel = m.label || m.modelOrAlias?.model || 'Unknown'
            const mFraction = m.quotaInfo?.remainingFraction ?? 1.0
            const mPercent = Math.floor(mFraction * 100)
            tooltip += `- ${mLabel}: ${mPercent}%\n`
        })

        tooltip += `\n`

        // Calculate Stats for the group
        // We can use HistoryService now!
        const history = HistoryService.getAggregatedHistory(this.context, 'hour', groupName)
        let ratePerMs = 0
        if (history.length >= 2) {
            let totalDelta = 0
            let totalTime = 0
            for (let i = 1; i < history.length; i++) {
                const prev = history[i - 1]
                const curr = history[i]
                if (curr.timestamp > prev.timestamp && curr.usage >= prev.usage) {
                    totalDelta += curr.usage - prev.usage
                    totalTime += curr.timestamp - prev.timestamp
                }
            }
            if (totalTime > 0) ratePerMs = totalDelta / totalTime
        }

        const remaining = fraction // fraction is remaining quota (0.0 to 1.0)

        let estLimitStr = 'Inf'
        if (ratePerMs > 0 && remaining > 0) {
            const timeLeftMs = remaining / ratePerMs
            const days = Math.floor(timeLeftMs / 86400000)
            const hours = Math.floor((timeLeftMs % 86400000) / 3600000)
            const mins = Math.round((timeLeftMs % 3600000) / 60000)

            if (days > 0) estLimitStr = `~${days}d ${hours}h`
            else if (hours > 0) estLimitStr = `~${hours}h ${mins}m`
            else estLimitStr = `~${mins}m`
        } else if (remaining <= 0) {
            estLimitStr = '0m'
        }

        // Reset Time
        let resetStr = 'Unknown'
        if (selectedModel.quotaInfo?.resetTime) {
            const resetDate = new Date(selectedModel.quotaInfo.resetTime)
            const now = new Date()
            const diffMs = resetDate.getTime() - now.getTime()

            if (resetDate > now) {
                const diffMins = Math.round(diffMs / 60000)
                const diffHrs = Math.floor(diffMs / 3600000)

                if (diffHrs > 0) {
                    const remainderMins = Math.round((diffMs % 3600000) / 60000)
                    resetStr = `${diffHrs}h ${remainderMins}m`
                } else {
                    resetStr = `${diffMins}m`
                }
            } else {
                resetStr = 'Now'
            }
        }

        tooltip += `Resets in: ${resetStr}\n`
        tooltip += `Est. Limit: ${estLimitStr}\n`
        tooltip += `Click to open Sidebar`

        widget.tooltip = tooltip
    }
}
