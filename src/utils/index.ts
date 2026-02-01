import {exec} from 'child_process'
import * as util from 'util'

export const execAsync = util.promisify(exec)

export function getNonce(): string {
    let text = ''
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
}

export function getModelCategory(label: string): string {
    const lowerLabel = label.toLowerCase()
    if (lowerLabel.includes('gemini') && lowerLabel.includes('pro')) {return 'Gemini Pro'}
    if (lowerLabel.includes('gemini') && lowerLabel.includes('flash')) {return 'Gemini Flash'}
    if (lowerLabel.includes('claude')) {return 'Claude'}
    if (lowerLabel.includes('gpt')) {return 'GPT'}
    return 'Other'
}
