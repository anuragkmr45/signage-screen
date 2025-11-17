/**
 * Preload script - IPC bridge between main and renderer
 * Exposes safe APIs to renderer via contextBridge
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { HealthStatus, DiagnosticsInfo, PairingResponse } from '../common/types'

// Define the API that will be exposed to the renderer
export interface HexmonAPI {
  // Playback
  onPlaybackUpdate: (callback: (data: unknown) => void) => void
  onMediaChange: (callback: (data: unknown) => void) => void
  onEmergencyOverride: (callback: (data: unknown) => void) => void

  // Pairing
  submitPairingCode: (code: string) => Promise<PairingResponse>
  getPairingStatus: () => Promise<{ paired: boolean; deviceId?: string }>

  // Diagnostics
  getDiagnostics: () => Promise<DiagnosticsInfo>
  toggleDiagnostics: () => Promise<void>

  // Health
  getHealth: () => Promise<HealthStatus>

  // Commands
  executeCommand: (command: string, payload?: unknown) => Promise<unknown>

  // Configuration
  getConfig: () => Promise<unknown>
  updateConfig: (updates: unknown) => Promise<void>

  // Logs
  log: (level: string, message: string, data?: unknown) => void
}

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('hexmon', {
  // Playback events
  onPlaybackUpdate: (callback: (data: unknown) => void) => {
    ipcRenderer.on('playback-update', (_event, data) => callback(data))
  },

  onMediaChange: (callback: (data: unknown) => void) => {
    ipcRenderer.on('media-change', (_event, data) => callback(data))
  },

  onEmergencyOverride: (callback: (data: unknown) => void) => {
    ipcRenderer.on('emergency-override', (_event, data) => callback(data))
  },

  // Pairing
  submitPairingCode: async (code: string): Promise<PairingResponse> => {
    return await ipcRenderer.invoke('submit-pairing', code)
  },

  getPairingStatus: async (): Promise<{ paired: boolean; deviceId?: string }> => {
    return await ipcRenderer.invoke('get-pairing-status')
  },

  // Diagnostics
  getDiagnostics: async (): Promise<DiagnosticsInfo> => {
    return await ipcRenderer.invoke('get-diagnostics')
  },

  toggleDiagnostics: async (): Promise<void> => {
    return await ipcRenderer.invoke('toggle-diagnostics')
  },

  // Health
  getHealth: async (): Promise<HealthStatus> => {
    return await ipcRenderer.invoke('get-health')
  },

  // Commands
  executeCommand: async (command: string, payload?: unknown): Promise<unknown> => {
    return await ipcRenderer.invoke('execute-command', command, payload)
  },

  // Configuration
  getConfig: async (): Promise<unknown> => {
    return await ipcRenderer.invoke('get-config')
  },

  updateConfig: async (updates: unknown): Promise<void> => {
    return await ipcRenderer.invoke('update-config', updates)
  },

  // Logging
  log: (level: string, message: string, data?: unknown): void => {
    ipcRenderer.send('renderer-log', { level, message, data })
  },
} as HexmonAPI)

// Expose version info
contextBridge.exposeInMainWorld('versions', {
  node: process.versions.node,
  chrome: process.versions.chrome,
  electron: process.versions.electron,
})

// Log that preload script loaded
console.log('Preload script loaded successfully')

