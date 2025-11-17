/**
 * Main process entry point for HexmonSignage Player
 * Orchestrates all services and manages application lifecycle
 */

console.log('=== HexmonSignage Player Starting ===')
console.log('NODE_ENV:', process.env['NODE_ENV'])
console.log('__dirname:', __dirname)

import { app, BrowserWindow, screen } from 'electron'
import * as path from 'path'
import { getConfigManager } from '../common/config'
import { getLogger } from '../common/logger'
import { ExponentialBackoff } from '../common/utils'

console.log('Initializing logger...')
const logger = getLogger('main')
console.log('Logger initialized')
const config = getConfigManager()

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  logger.warn('Another instance is already running. Exiting.')
  app.quit()
} else {
  app.on('second-instance', () => {
    logger.warn('Attempted to start second instance')
    // Focus the existing window if it exists
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

let mainWindow: BrowserWindow | null = null
const restartBackoff = new ExponentialBackoff(1000, 60000, 10)

// Disable hardware acceleration if needed for stability
// app.disableHardwareAcceleration()

/**
 * Create the main browser window with kiosk settings
 */
function createWindow(): void {
  const appConfig = config.getConfig()
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.workAreaSize

  logger.info({ width, height }, 'Creating main window')

  mainWindow = new BrowserWindow({
    width,
    height,
    fullscreen: true,
    kiosk: true,
    frame: false,
    show: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, '../../renderer/preload/index.js'),
      nodeIntegration: appConfig.security.nodeIntegration,
      contextIsolation: appConfig.security.contextIsolation,
      sandbox: appConfig.security.sandbox,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      enableBlinkFeatures: undefined,
    },
  })

  // Set Content Security Policy
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [appConfig.security.csp],
      },
    })
  })

  // Load the renderer
  // Main process is at dist/main/main/index.js, renderer is at dist/renderer/index.html
  const rendererPath = path.join(__dirname, '../../renderer/index.html')
  logger.info({ rendererPath }, 'Loading renderer HTML')
  mainWindow.loadFile(rendererPath)
    .then(() => {
      logger.info('Renderer HTML loaded successfully')
    })
    .catch((error) => {
      logger.error({ error, rendererPath }, 'Failed to load renderer')
    })

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    logger.info('Main window shown')
    restartBackoff.reset()
  })

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null
    logger.info('Main window closed')
  })

  // Handle crashes - use render-process-gone instead of deprecated 'crashed'
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error({ reason: details.reason, exitCode: details.exitCode }, 'Renderer process gone')
    handleCrash()
  })

  // Prevent navigation away from the app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL()

    if (currentUrl && url !== currentUrl) {
      logger.warn({ url }, 'Prevented navigation')
      event.preventDefault()
    }
  })

  // Prevent new window creation
  mainWindow.webContents.setWindowOpenHandler(() => {
    logger.warn('Prevented new window creation')
    return { action: 'deny' }
  })

  // Hide cursor if configured
  if (process.env['HEXMON_HIDE_CURSOR'] === 'true') {
    mainWindow.webContents.insertCSS('* { cursor: none !important; }').catch((error) => {
      logger.error({ error }, 'Failed to hide cursor')
    })
  }
}

/**
 * Handle application crash with bounded exponential backoff
 */
function handleCrash(): void {
  const delay = restartBackoff.getDelay()
  logger.info({ delay, attempt: restartBackoff.getAttempt() }, 'Scheduling restart after crash')

  setTimeout(() => {
    if (mainWindow) {
      mainWindow.destroy()
      mainWindow = null
    }
    createWindow()
  }, delay)
}

/**
 * Initialize all services
 */
async function initializeServices(): Promise<void> {
  logger.info('Initializing services...')

  try {
    // Validate configuration
    const validation = config.validateConfig()
    if (!validation.valid) {
      logger.error({ errors: validation.errors }, 'Invalid configuration')
      throw new Error('Invalid configuration: ' + validation.errors.join(', '))
    }

    // Import services
    const { getPairingService } = await import('./services/pairing-service')
    const { getTelemetryService } = await import('./services/telemetry/telemetry-service')
    const { getScheduleManager } = await import('./services/schedule-manager')
    const { getPlaybackEngine } = await import('./services/playback/playback-engine')
    const { getWebSocketClient } = await import('./services/network/websocket-client')

    // 1. Check pairing status
    const pairingService = getPairingService()
    if (!pairingService.isPairedDevice()) {
      logger.warn('Device not paired, pairing required')
      // Pairing screen will be shown in renderer
      return
    }

    // 2. Start telemetry service
    const telemetryService = getTelemetryService()
    await telemetryService.start()

    // 3. Connect WebSocket
    const wsClient = getWebSocketClient()
    await wsClient.connect()

    // 4. Start schedule manager
    const scheduleManager = getScheduleManager()
    await scheduleManager.start()

    // 5. Initialize playback engine
    const playbackEngine = getPlaybackEngine()
    if (mainWindow) {
      playbackEngine.initialize(mainWindow)
      await playbackEngine.start()
    }

    logger.info('All services initialized successfully')
  } catch (error) {
    logger.fatal({ error }, 'Failed to initialize services')
    throw error
  }
}

/**
 * Setup IPC handlers
 */
function setupIPCHandlers(): void {
  const { ipcMain } = require('electron')

  // Pairing
  ipcMain.handle('submit-pairing', async (_event: any, code: string) => {
    const { getPairingService } = await import('./services/pairing-service')
    const pairingService = getPairingService()
    return await pairingService.submitPairing(code)
  })

  ipcMain.handle('get-pairing-status', async () => {
    const { getPairingService } = await import('./services/pairing-service')
    const pairingService = getPairingService()
    return {
      paired: pairingService.isPairedDevice(),
      deviceId: pairingService.getDeviceId(),
    }
  })

  // Diagnostics
  ipcMain.handle('get-diagnostics', async () => {
    const { getPairingService } = await import('./services/pairing-service')
    const { getWebSocketClient } = await import('./services/network/websocket-client')
    const { getScheduleManager } = await import('./services/schedule-manager')
    const { getRequestQueue } = await import('./services/network/request-queue')

    const pairingService = getPairingService()
    const wsClient = getWebSocketClient()
    const scheduleManager = getScheduleManager()
    const requestQueue = getRequestQueue()

    const diagnostics = await pairingService.runDiagnostics()
    const schedule = scheduleManager.getCurrentSchedule()

    return {
      deviceId: pairingService.getDeviceId() || 'Not paired',
      ipAddress: diagnostics.ipAddresses.join(', '),
      wsState: wsClient.getState(),
      lastSync: schedule ? new Date().toISOString() : undefined,
      commandQueueSize: requestQueue.getSize(),
      screenMode: 'fullscreen',
      uptime: process.uptime(),
      version: app.getVersion(),
    }
  })

  // Health
  ipcMain.handle('get-health', async () => {
    // Health server is available but not used directly here
    // This would return health status - simplified for now
    return {
      status: 'healthy',
      appVersion: app.getVersion(),
      uptime: process.uptime(),
    }
  })

  // Renderer logging
  ipcMain.on('renderer-log', (_event: any, { level, message, data }: any) => {
    const rendererLogger = getLogger('renderer')
    rendererLogger[level as keyof typeof rendererLogger](data, message)
  })

  logger.info('IPC handlers setup complete')
}

/**
 * Cleanup on exit
 */
async function cleanup(): Promise<void> {
  logger.info('Cleaning up...')

  try {
    // Stop all services
    const { getTelemetryService } = await import('./services/telemetry/telemetry-service')
    const { getScheduleManager } = await import('./services/schedule-manager')
    const { getPlaybackEngine } = await import('./services/playback/playback-engine')
    const { getWebSocketClient } = await import('./services/network/websocket-client')
    const { getProofOfPlayService } = await import('./services/pop-service')
    const { getCacheManager } = await import('./services/cache/cache-manager')

    const telemetryService = getTelemetryService()
    await telemetryService.stop()

    const scheduleManager = getScheduleManager()
    scheduleManager.stop()

    const playbackEngine = getPlaybackEngine()
    playbackEngine.stop()

    const wsClient = getWebSocketClient()
    wsClient.disconnect()

    const popService = getProofOfPlayService()
    await popService.cleanup()

    const cacheManager = getCacheManager()
    await cacheManager.cleanup()

    logger.info('Cleanup completed')
  } catch (error) {
    logger.error({ error }, 'Error during cleanup')
  }
}

// ============================================================================
// Application Lifecycle
// ============================================================================

app.on('ready', async () => {
  logger.info({ version: app.getVersion(), electron: process.versions.electron }, 'Application starting')

  try {
    setupIPCHandlers()
    await initializeServices()
    createWindow()
  } catch (error) {
    logger.fatal({ error }, 'Failed to start application')
    app.quit()
  }
})

app.on('window-all-closed', () => {
  // On Linux, keep the app running even if all windows are closed
  // This is important for kiosk mode
  logger.info('All windows closed, but keeping app running')
})

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (mainWindow === null) {
    createWindow()
  }
})

app.on('before-quit', async (event) => {
  event.preventDefault()
  await cleanup()
  app.exit(0)
})

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception')
  // Don't exit immediately, let the app try to recover
})

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection')
})

// Log startup complete
logger.info('Main process initialized')

