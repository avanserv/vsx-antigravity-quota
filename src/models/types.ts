export interface QuotaInfo {
    modelOrAlias?: {
        model?: string
    }
    quotaInfo?: {
        remainingFraction?: number
        resetTime?: string
    }
    label?: string
}

export interface UserStatus {
    userStatus?: {
        defaultOverrideModelConfig?: {
            modelOrAlias?: {
                model?: string
            }
        }
        cascadeModelConfigData?: {
            clientModelConfigs?: QuotaInfo[]
        }
        planStatus?: {
            availablePromptCredits?: number
            availableFlowCredits?: number
            [key: string]: any // Allow other properties
        }
        [key: string]: any // Allow other properties
    }
    [key: string]: any // Allow top level props
}

export interface UsageEntry {
    timestamp: number
    usage: number // Max usage across all (legacy/fallback)
    usageByCategory?: {[key: string]: number} // New detailed breakdown
}

export interface ServerCandidate {
    pid: number
    token: string
}
