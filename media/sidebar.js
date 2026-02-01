const vscode = acquireVsCodeApi()

let modelsList = document.getElementById('models-list')
let creditsContainer = document.getElementById('credits-container')
let historyContainer = document.getElementById('history-container')
let refreshBtn = document.getElementById('refresh-btn')
let debugBtn = document.getElementById('debug-btn')

let lastData = null
let historyVisibility = {} // Stores expand/collapse state by groupName

// Re-acquire elements if script re-runs (unlikely in VSCode webview unless reloaded)
if (!modelsList) modelsList = document.getElementById('models-list')

if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        vscode.postMessage({type: 'refresh'})
    })
}

if (debugBtn) {
    debugBtn.addEventListener('click', () => {
        if (lastData) {
            vscode.postMessage({type: 'debug', value: lastData})
        } else {
            vscode.postMessage({type: 'debug', value: null})
        }
    })
}

window.addEventListener('message', (event) => {
    const message = event.data
    switch (message.type) {
        case 'loading':
            // optional loading state
            break
        case 'data':
            const val = message.value
            lastData = val.userStatus
            updateUI(val.userStatus, val.histories, val.period)
            break
        case 'error':
            modelsList.innerHTML = 'Error: ' + message.value
            break
    }
})

function setPeriod(period) {
    vscode.postMessage({type: 'setPeriod', value: period})
}

function calculateStats(history) {
    if (!history || history.length < 2) return null

    let totalDelta = 0
    let totalTime = 0
    let validPoints = 0

    for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1]
        const curr = history[i]
        if (curr.timestamp > prev.timestamp && curr.usage >= prev.usage) {
            totalDelta += curr.usage - prev.usage
            totalTime += curr.timestamp - prev.timestamp
            validPoints++
        }
    }

    const ratePerMs = totalTime > 0 ? totalDelta / totalTime : 0
    const unitMs = 3600000 // Hour

    const ratePerUnit = ratePerMs * unitMs
    const rateDisplay = (ratePerUnit * 100).toFixed(1)

    const lastUsage = history[history.length - 1].usage
    const remaining = 1.0 - lastUsage

    let timeLeftStr = 'Inf'
    let timeLeftMs = Infinity

    if (ratePerMs > 0 && remaining > 0) {
        timeLeftMs = remaining / ratePerMs
        const days = Math.floor(timeLeftMs / 86400000)
        const hours = Math.floor((timeLeftMs % 86400000) / 3600000)
        const mins = Math.round((timeLeftMs % 3600000) / 60000)

        if (days > 0) timeLeftStr = `~${days}d ${hours}h`
        else if (hours > 0) timeLeftStr = `~${hours}h ${mins}m`
        else timeLeftStr = `~${mins}m`
    } else if (remaining <= 0) {
        timeLeftStr = '0m'
        timeLeftMs = 0
    }

    return {
        rateDisplay,
        timeLeftStr,
        timeLeftMs,
        validPoints,
    }
}

function renderGraph(container, history, currentPeriod, groupName) {
    if (!history || history.length === 0) return

    const wrapper = document.createElement('div')
    wrapper.style.marginTop = '12px'
    wrapper.style.borderTop = '1px solid var(--vscode-widget-border)'

    // Header / Toggle
    const header = document.createElement('div')
    header.style.padding = '8px 0'
    header.style.cursor = 'pointer'
    header.style.display = 'flex'
    header.style.alignItems = 'center'
    header.style.opacity = '0.9'
    header.style.userSelect = 'none' // Prevent text selection on double click

    // State check
    const isExpanded = historyVisibility[groupName] === true

    // Chevron
    const chevron = document.createElement('div')
    chevron.style.display = 'flex'
    chevron.style.alignItems = 'center'
    chevron.style.justifyContent = 'center'
    chevron.style.width = '16px'
    chevron.style.height = '16px'
    chevron.style.marginRight = '6px'
    chevron.style.transition = 'transform 0.15s ease'

    // Use mask-image to allow coloring via background-color (currentColor behavior)
    const icon = document.createElement('div')
    icon.style.width = '100%'
    icon.style.height = '100%'
    icon.style.backgroundColor = 'currentColor'
    icon.style.mask = `url(${window.viewConfig?.chevronUri}) no-repeat center`
    icon.style.webkitMask = `url(${window.viewConfig?.chevronUri}) no-repeat center`

    chevron.appendChild(icon)

    if (isExpanded) {
        chevron.style.transform = 'rotate(90deg)'
    }

    const title = document.createElement('span')
    title.innerText = 'Usage History (Last Hour)'
    title.style.fontSize = '0.9em'
    title.style.fontWeight = '500'

    header.appendChild(chevron)
    header.appendChild(title)

    wrapper.appendChild(header)

    // Content container (Hidden by default unless saved state is true)
    const content = document.createElement('div')
    content.style.display = isExpanded ? 'block' : 'none'

    // --- Graph Rendering ---
    const graphContainer = document.createElement('div')
    graphContainer.className = 'graph-container'

    history.forEach((h) => {
        const barWrapper = document.createElement('div')
        barWrapper.className = 'bar-wrapper'

        const bar = document.createElement('div')
        bar.className = 'bar'

        if (h.usage >= 0.8) {
            bar.classList.add('danger')
        } else if (h.usage >= 0.3) {
            bar.classList.add('warning')
        } else {
            bar.classList.add('success')
        }

        const pct = Math.min(Math.max(h.usage * 100, 0), 100)
        bar.style.height = pct + '%'

        const date = new Date(h.timestamp)
        const timeStr = date.toLocaleTimeString()

        barWrapper.title = `${timeStr} - ${(h.usage * 100).toFixed(1)}%`

        barWrapper.appendChild(bar)
        graphContainer.appendChild(barWrapper)
    })

    content.appendChild(graphContainer)
    wrapper.appendChild(content)
    container.appendChild(wrapper)

    header.onclick = () => {
        const currentlyExpanded = content.style.display === 'block'
        if (currentlyExpanded) {
            content.style.display = 'none'
            chevron.style.transform = 'rotate(0deg)'
            historyVisibility[groupName] = false
        } else {
            content.style.display = 'block'
            chevron.style.transform = 'rotate(90deg)'
            historyVisibility[groupName] = true
        }
    }
}

function updateUI(responseData, histories, currentPeriod) {
    if (!modelsList || !creditsContainer || !historyContainer) return

    modelsList.innerHTML = ''
    creditsContainer.innerHTML = ''
    historyContainer.innerHTML = ''

    const status = responseData?.userStatus
    const plan = status?.planStatus

    if (plan) {
        let planHtml = '<div class="card p-3">'

        let tier = plan.tierName || (plan.status ? 'Active' : 'Unknown')
        if (status.userTier) {
            if (typeof status.userTier === 'string') {
                tier = status.userTier
            } else if (typeof status.userTier === 'object') {
                tier =
                    status.userTier.name || status.userTier.label || status.userTier.tierName || 'Unknown Tier Object'
            }
        }
        planHtml += `<div class="mb-2"><strong>Tier:</strong> <span class="tag">${tier}</span></div>`

        Object.keys(plan).forEach((key) => {
            if (key === 'tierName' || key === 'status' || key.includes('Credits')) return
            const val = plan[key]
            if (typeof val !== 'object' && val !== null) {
                const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())
                planHtml += `<div class="mb-1">${label}: <strong>${val}</strong></div>`
            }
        })

        Object.keys(status).forEach((key) => {
            const lowerKey = key.toLowerCase()
            if (
                key === 'planStatus' ||
                key === 'cascadeModelConfigData' ||
                key === 'userTier' ||
                key === 'features' ||
                key === 'enabledFeatures'
            )
                return
            if (
                lowerKey.includes('telemetry') ||
                lowerKey.includes('termsofuse') ||
                lowerKey.includes('tou') ||
                lowerKey.includes('userdatacollection')
            )
                return
            if (lowerKey.includes('acceptedlatest') || lowerKey.includes('termsofservice')) return

            const val = status[key]
            if (typeof val !== 'object' && val !== null) {
                const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())
                planHtml += `<div class="mb-1">${label}: <strong>${val}</strong></div>`
            }
        })

        planHtml += '</div>'
        creditsContainer.innerHTML = planHtml
    }

    const models = status?.cascadeModelConfigData?.clientModelConfigs || []

    const groups = {
        'Gemini Pro': [],
        'Gemini Flash': [],
        Claude: [],
        GPT: [],
        Other: [],
    }

    models.forEach((model) => {
        const label = model.label || model.modelOrAlias?.model || 'Unknown'
        const lowerLabel = label.toLowerCase()

        if (lowerLabel.includes('gemini') && lowerLabel.includes('pro')) {
            groups['Gemini Pro'].push(model)
        } else if (lowerLabel.includes('gemini') && lowerLabel.includes('flash')) {
            groups['Gemini Flash'].push(model)
        } else if (lowerLabel.includes('claude')) {
            groups['Claude'].push(model)
        } else if (lowerLabel.includes('gpt')) {
            groups['GPT'].push(model)
        } else {
            groups['Other'].push(model)
        }
    })

    const pinnedGroups = responseData?.pinnedGroups || []

    Object.keys(groups).forEach((groupName) => {
        const groupModels = groups[groupName]
        if (groupModels.length === 0) return

        const uniqueQuotas = {}
        groupModels.forEach((m) => {
            const fraction = m.quotaInfo?.remainingFraction
            const reset = m.quotaInfo?.resetTime || ''
            const key = (fraction !== undefined ? fraction : 'unk') + '|' + reset
            if (!uniqueQuotas[key]) {
                uniqueQuotas[key] = {
                    models: [],
                    quotaInfo: m.quotaInfo,
                    fraction: fraction,
                }
            }
            uniqueQuotas[key].models.push(m.label || m.modelOrAlias?.model)
        })

        const sectionDiv = document.createElement('div')
        sectionDiv.className = 'card model-card'

        const headerDiv = document.createElement('div')
        headerDiv.className = 'header'
        headerDiv.style.fontSize = '1em'
        headerDiv.style.marginBottom = '8px'
        headerDiv.style.display = 'flex'
        headerDiv.style.justifyContent = 'space-between'
        headerDiv.style.alignItems = 'center'

        const titleSpan = document.createElement('span')
        titleSpan.innerText = groupName

        const pinSpan = document.createElement('span')
        pinSpan.style.cursor = 'pointer'
        pinSpan.title = pinnedGroups.includes(groupName) ? 'Unpin from Status Bar' : 'Pin to Status Bar'
        const isPinned = pinnedGroups.includes(groupName)

        // Pin Icon Container
        const pinIcon = document.createElement('div')
        pinIcon.style.width = '100%'
        pinIcon.style.height = '100%'

        pinSpan.style.width = '16px'
        pinSpan.style.height = '16px'
        pinSpan.style.display = 'block'
        pinSpan.appendChild(pinIcon)

        // Helper to update state
        const updatePinVisuals = (active) => {
            if (active) {
                // Pinned
                pinIcon.style.backgroundColor = 'var(--vscode-charts-yellow)'
                pinIcon.style.mask = `url(${window.viewConfig?.pinFilledUri}) no-repeat center`
                pinIcon.style.webkitMask = `url(${window.viewConfig?.pinFilledUri}) no-repeat center`
                pinSpan.title = 'Unpin from Status Bar'
            } else {
                // Unpinned (Outline)
                pinIcon.style.backgroundColor = 'var(--vscode-icon-foreground)'
                pinIcon.style.mask = `url(${window.viewConfig?.pinOutlineUri}) no-repeat center`
                pinIcon.style.webkitMask = `url(${window.viewConfig?.pinOutlineUri}) no-repeat center`
                pinSpan.title = 'Pin to Status Bar'
            }
        }

        // Initial State
        updatePinVisuals(isPinned)

        // Hover Effects
        pinSpan.onmouseenter = () => {
            let currentlyPinned = pinSpan.dataset.pinned === 'true'
            if (!currentlyPinned) {
                // Hover Unpinned (Solid)
                pinIcon.style.mask = `url(${window.viewConfig?.pinSolidUri}) no-repeat center`
                pinIcon.style.webkitMask = `url(${window.viewConfig?.pinSolidUri}) no-repeat center`
            }
        }
        pinSpan.onmouseleave = () => {
            const isNowPinned = pinSpan.dataset.pinned === 'true'
            updatePinVisuals(isNowPinned)
        }

        // Persist initial state to dataset for hover logic
        pinSpan.dataset.pinned = isPinned ? 'true' : 'false'

        pinSpan.onclick = (e) => {
            e.stopPropagation()

            // Reading current state from dataset to handle optimistic toggles
            const currentState = pinSpan.dataset.pinned === 'true'
            const newState = !currentState

            // Optimistic Update
            pinSpan.dataset.pinned = newState ? 'true' : 'false'
            updatePinVisuals(newState)

            console.log('Toggling pin for:', groupName, 'New State:', newState)
            vscode.postMessage({type: 'togglePin', value: groupName})
        }

        headerDiv.appendChild(titleSpan)
        headerDiv.appendChild(pinSpan)

        sectionDiv.appendChild(headerDiv)

        let sectionHtml = ''

        // Calculate stats for this group
        let stats = null
        if (histories && histories[groupName]) {
            stats = calculateStats(histories[groupName])
        }

        Object.values(uniqueQuotas).forEach((q) => {
            const labels = q.models.map((l) => `<span class="model-tag">${l}</span>`).join('')
            const fraction = q.fraction ?? 1
            const percentage = (fraction * 100).toFixed(0)

            let colorClass = 'success'
            if (fraction <= 0.2) {
                colorClass = 'danger'
            } else if (fraction <= 0.7) {
                colorClass = 'warning'
            }

            let resetHtml = ''
            if (q.quotaInfo?.resetTime) {
                const resetDate = new Date(q.quotaInfo.resetTime)
                const now = new Date()
                const resetTimeMs = resetDate.getTime() - now.getTime() // Ms until reset

                const day = resetDate.getDate().toString().padStart(2, '0')
                const month = (resetDate.getMonth() + 1).toString().padStart(2, '0')
                const year = resetDate.getFullYear()
                const hours = resetDate.getHours().toString().padStart(2, '0')
                const minutes = resetDate.getMinutes().toString().padStart(2, '0')
                const dateStr = `${day}/${month}/${year} ${hours}:${minutes}`

                let relativeStr = ''
                if (resetDate > now) {
                    const diffMs = resetDate.getTime() - now.getTime()
                    const diffMins = Math.round(diffMs / 60000)
                    const diffHrs = Math.floor(diffMs / 3600000)
                    const diffDays = Math.floor(diffMs / 86400000)

                    if (diffDays > 0) {
                        const remainderHrs = Math.floor((diffMs % 86400000) / 3600000)
                        relativeStr = `(in ${diffDays}d ${remainderHrs}h)`
                    } else if (diffHrs > 0) {
                        const remainderMins = Math.round((diffMs % 3600000) / 60000)
                        relativeStr = `(in ${diffHrs}h ${remainderMins}m)`
                    } else {
                        relativeStr = `(in ${diffMins}m)`
                    }
                }

                resetHtml = `<div class="reset-time"><span class="codicon codicon-history"></span> Resets: ${dateStr} ${relativeStr}</div>`

                // Add stats here with same styling
                if (stats && stats.validPoints > 0) {
                    let warningHtml = ''
                    if (resetTimeMs > 0 && stats.timeLeftMs < resetTimeMs) {
                        warningHtml =
                            ' <span style="background:var(--vscode-charts-red); color:white; border-radius:12px; padding:1px 8px; font-size:0.8em; font-weight:600; margin-left:6px; display:inline-block; line-height: 1.4em;" title="You will run out before quota resets!">⚠ LOW</span>'
                    }

                    resetHtml += `<div class="reset-time"><span class="codicon codicon-pulse"></span> Usage: ${stats.rateDisplay}% / hr</div>`
                    resetHtml += `<div class="reset-time"><span class="codicon codicon-watch"></span> Est. limit: ${stats.timeLeftStr}${warningHtml}</div>`
                }
            }

            sectionHtml += `
                <div class="model-tags" style="margin-bottom: 8px;">${labels}</div>
                <div class="progress-section" style="margin-bottom: 12px;">
                    <div class="flex-row">
                        <span>Remaining Quota</span>
                        <span>${percentage}%</span>
                    </div>
                    <div class="progress-track">
                        <div class="progress-fill ${colorClass}" style="width: ${percentage}%"></div>
                    </div>
                    ${resetHtml}
                </div>
            `
        })

        const contentDiv = document.createElement('div')
        contentDiv.innerHTML = sectionHtml
        sectionDiv.appendChild(contentDiv)

        if (histories && histories[groupName]) {
            renderGraph(sectionDiv, histories[groupName], currentPeriod, groupName)
        }

        modelsList.appendChild(sectionDiv)
    })

    let features = status?.enabledFeatures || status?.features
    if (Array.isArray(features) && features.length > 0) {
        const featuresDiv = document.createElement('div')
        featuresDiv.className = 'card'
        featuresDiv.innerHTML = `
            <div class="header">Enabled Features</div>
            <div class="feature-list">
                ${features.map((f) => `<span class="tag feature-tag">${f}</span>`).join('')}
            </div>
        `
        modelsList.appendChild(featuresDiv)
    }
}

// Signal readiness to extension
vscode.postMessage({type: 'ready'})
