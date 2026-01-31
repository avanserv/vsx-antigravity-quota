import axios from 'axios'
import {execAsync} from '../utils'
import {ServerCandidate, UserStatus} from '../models/types'

export class LanguageServerService {
    private static cachedConnection: {port: number; token: string} | null = null
    private static readonly TIMEOUT_MS = 500

    public static async fetchUserStatusFromAnyCandidate(): Promise<UserStatus> {
        // 1. Try cached connection first
        if (this.cachedConnection) {
            try {
                return await this.fetchUserStatus(this.cachedConnection.port, this.cachedConnection.token)
            } catch (error) {
                console.log(
                    `Cached connection failed, falling back to discovery: ${error instanceof Error ? error.message : String(error)}`
                )
                this.cachedConnection = null // Clear invalid cache
            }
        }

        console.log('Starting Language Server discovery...')
        const candidates = await this.findLanguageServerCandidates()
        console.log(`Found ${candidates.length} candidate processes.`)

        if (candidates.length === 0) {
            throw new Error('No Antigravity Language Server process found.')
        }

        let lastError: any

        // Try candidates (most recent first)
        for (const candidate of candidates.reverse()) {
            const ports = await this.getListeningPorts(candidate.pid)

            for (const port of ports) {
                try {
                    const status = await this.fetchUserStatus(port, candidate.token)

                    // Cache the successful connection
                    this.cachedConnection = {port, token: candidate.token}
                    return status
                } catch (error) {
                    lastError = error
                }
            }
        }

        throw lastError || new Error('Could not connect to any Language Server port.')
    }

    private static async fetchUserStatus(port: number, token: string): Promise<UserStatus> {
        const url = `http://127.0.0.1:${port}/exa.language_server_pb.LanguageServerService/GetUserStatus`

        const response = await axios.post(
            url,
            {
                metadata: {
                    ideName: 'antigravity',
                    extensionName: 'antigravity',
                    locale: 'en',
                },
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Connect-Protocol-Version': '1',
                    'X-Codeium-Csrf-Token': token,
                },
                timeout: this.TIMEOUT_MS,
            }
        )
        return response.data
    }

    private static async findLanguageServerCandidates(): Promise<ServerCandidate[]> {
        try {
            // Find all language_server processes
            const {stdout} = await execAsync('pgrep -af language_server')
            const candidates: ServerCandidate[] = []

            const lines = stdout.split('\n')
            for (const line of lines) {
                if (
                    (line.includes('antigravity') || line.includes('language_server')) &&
                    line.includes('--csrf_token')
                ) {
                    const pidMatch = line.match(/^(\d+)\s/)
                    const tokenMatch = line.match(/--csrf_token[=\s]+([a-zA-Z0-9\-]+)/)

                    if (pidMatch && tokenMatch) {
                        candidates.push({
                            pid: parseInt(pidMatch[1], 10),
                            token: tokenMatch[1],
                        })
                    }
                }
            }
            return candidates
        } catch (error) {
            console.error('Error running pgrep:', error)
            return []
        }
    }

    private static async getListeningPorts(pid: number): Promise<number[]> {
        try {
            // Use ss to find listening tcp ports for the PID
            const {stdout} = await execAsync(`ss -tlnp | grep "pid=${pid},"`)
            const ports: number[] = []
            const lines = stdout.split('\n')
            for (const line of lines) {
                const match = line.match(/(?:127\.0\.0\.1|::1|\[::1\]):(\d+)/)
                if (match) {
                    ports.push(parseInt(match[1], 10))
                }
            }
            return ports
        } catch (error) {
            console.warn(`Failed to get ports for PID ${pid} via ss`, error)
            return []
        }
    }
}
