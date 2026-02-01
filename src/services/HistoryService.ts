import * as vscode from 'vscode'
import {getModelCategory} from '../utils'
import {UsageEntry, UserStatus} from '../models/types'

export class HistoryService {
    private static readonly HISTORY_KEY = 'antigravity.usageHistory'
    private static readonly MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

    public static async updateUsageHistory(context: vscode.ExtensionContext, status: UserStatus) {
        const models = status?.userStatus?.cascadeModelConfigData?.clientModelConfigs || []

        // Calculate max usage per category
        const categoryUsage: {[key: string]: number} = {}
        let overallMax = 0

        models.forEach((m) => {
            const fraction = m.quotaInfo?.remainingFraction ?? 0
            const usage = 1.0 - fraction

            // Update overall max
            if (usage > overallMax) {overallMax = usage}

            // Update category max
            const label = m.label || m.modelOrAlias?.model || 'Unknown'
            const category = getModelCategory(label)

            if (!categoryUsage[category] || usage > categoryUsage[category]) {
                categoryUsage[category] = usage
            }
        })

        const entry: UsageEntry = {
            timestamp: Date.now(),
            usage: overallMax,
            usageByCategory: categoryUsage,
        }

        const history: UsageEntry[] = context.globalState.get(this.HISTORY_KEY, [])
        history.push(entry)

        // Prune old entries
        const now = Date.now()
        const cutoff = now - this.MAX_AGE_MS
        const filteredHistory = history.filter((e) => e.timestamp >= cutoff)

        await context.globalState.update(this.HISTORY_KEY, filteredHistory)
    }

    public static getAggregatedHistory(
        context: vscode.ExtensionContext,
        period: 'hour' | 'day' | 'week',
        categoryFilter?: string
    ): UsageEntry[] {
        const history: UsageEntry[] = context.globalState.get(this.HISTORY_KEY, [])
        if (!history.length) {return []}

        const now = Date.now()
        let durationMs = 0
        let stepMs = 0

        switch (period) {
            case 'hour':
                durationMs = 60 * 60 * 1000 // 1 hr
                stepMs = 60 * 1000 // 1 min steps
                break
            case 'day':
                durationMs = 24 * 60 * 60 * 1000 // 24 hr
                stepMs = 60 * 60 * 1000 // 1 hr steps
                break
            case 'week':
                durationMs = 7 * 24 * 60 * 60 * 1000 // 7 days
                stepMs = 4 * 60 * 60 * 1000 // 4 hr steps
                break
        }

        const startTime = now - durationMs
        const relevantData = history.filter((e) => e.timestamp >= startTime)

        const bucketCount = Math.ceil(durationMs / stepMs)
        const result: UsageEntry[] = []

        for (let i = 0; i < bucketCount; i++) {
            const bucketStart = startTime + i * stepMs
            result.push({timestamp: bucketStart, usage: 0})
        }

        // Fill buckets
        relevantData.forEach((entry) => {
            // Find which bucket this entry belongs to
            const offset = entry.timestamp - startTime
            if (offset < 0) {return}

            const bucketIndex = Math.floor(offset / stepMs)
            if (bucketIndex >= 0 && bucketIndex < result.length) {
                // Determine the usage value to use for this entry
                let val = entry.usage // Default to overall max

                if (categoryFilter && categoryFilter !== 'All') {
                    if (entry.usageByCategory && entry.usageByCategory[categoryFilter] !== undefined) {
                        val = entry.usageByCategory[categoryFilter]
                    } else {
                        // fall back to 0 if category not present
                        val = 0
                    }
                }

                // Max aggregation within the bucket
                if (val > result[bucketIndex].usage) {
                    result[bucketIndex].usage = val
                }
            }
        })

        return result
    }
}
