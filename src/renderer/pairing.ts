import type { PairingCodeRequest, PlayerStatus, RuntimeMode } from '../common/types'
import './types'

export const LANDING_DURATION_MS = 3000

export type KioskSurfaceKind =
  | 'hidden'
  | 'landing'
  | 'setup-required'
  | 'backend-unavailable'
  | 'pairing'
  | 'provisioning'
  | 'recovery'
  | 'discreet-backend'

export interface KioskSurfaceView {
  kind: KioskSurfaceKind
  fullScreen: boolean
  kicker: string
  title: string
  message: string
  statusText: string
  stateLabel: string
  showPairingCode: boolean
  showProgress: boolean
  showDeveloperControls: boolean
  showDiscreetConnectivityNotice: boolean
}

const BACKEND_UNAVAILABLE_MESSAGE =
  'This screen cannot reach the signage service right now. It will keep trying automatically. Please contact your administrator if this message remains on screen.'
const SETUP_REQUIRED_MESSAGE =
  'This screen needs a service address before it can be connected. Please contact your administrator.'
const DISCREET_CONNECTIVITY_MESSAGE =
  'Service connection unavailable. Playback continues from stored content while the screen keeps trying automatically.'

export function shouldShowDeveloperControls(runtimeMode: RuntimeMode): boolean {
  return runtimeMode === 'dev'
}

export function hasPlayableContent(status: PlayerStatus): boolean {
  return (
    ['PAIRED_RUNTIME', 'SOFT_RECOVERY', 'BOOTSTRAP_AUTH'].includes(status.state) &&
    status.mode !== 'empty'
  )
}

export function isConfigurationRequired(status: PlayerStatus): boolean {
  return (
    status.state === 'BOOT' &&
    typeof status.error === 'string' &&
    status.error.toLowerCase().includes('configuration required')
  )
}

export function resolveKioskSurfaceView(
  status: PlayerStatus,
  options: { landingElapsed: boolean; runtimeMode: RuntimeMode }
): KioskSurfaceView {
  const showDeveloperControls = shouldShowDeveloperControls(options.runtimeMode)

  if (status.backendAvailable === false && hasPlayableContent(status)) {
    return {
      kind: 'discreet-backend',
      fullScreen: false,
      kicker: 'Service notice',
      title: 'Service connection unavailable',
      message: DISCREET_CONNECTIVITY_MESSAGE,
      statusText: 'Playback continues from stored content.',
      stateLabel: 'Retrying',
      showPairingCode: false,
      showProgress: false,
      showDeveloperControls,
      showDiscreetConnectivityNotice: true,
    }
  }

  if (!options.landingElapsed) {
    return {
      kind: 'landing',
      fullScreen: true,
      kicker: 'Screen service',
      title: 'HexmonSignage Player',
      message: 'Preparing this screen for service.',
      statusText: 'Starting screen service.',
      stateLabel: 'Starting',
      showPairingCode: false,
      showProgress: true,
      showDeveloperControls,
      showDiscreetConnectivityNotice: false,
    }
  }

  if (isConfigurationRequired(status)) {
    return {
      kind: 'setup-required',
      fullScreen: true,
      kicker: 'Setup required',
      title: 'Setup required',
      message: SETUP_REQUIRED_MESSAGE,
      statusText: 'Administrator action required.',
      stateLabel: 'Setup',
      showPairingCode: false,
      showProgress: false,
      showDeveloperControls,
      showDiscreetConnectivityNotice: false,
    }
  }

  if (status.backendAvailable === false && !status.pairingCode) {
    return {
      kind: 'backend-unavailable',
      fullScreen: true,
      kicker: 'Service notice',
      title: 'Service connection unavailable',
      message: BACKEND_UNAVAILABLE_MESSAGE,
      statusText: 'Automatic retry is active.',
      stateLabel: 'Retrying',
      showPairingCode: false,
      showProgress: true,
      showDeveloperControls,
      showDiscreetConnectivityNotice: false,
    }
  }

  if (status.state === 'PAIRING_PENDING') {
    if (status.pairingCode) {
      return {
        kind: 'pairing',
        fullScreen: true,
        kicker: 'Connect this display',
        title: 'Connect this screen',
        message: 'Enter this code in the HexmonSignage admin console to connect this display. This screen updates automatically.',
        statusText: 'Waiting for administrator approval.',
        stateLabel: 'Pairing',
        showPairingCode: true,
        showProgress: false,
        showDeveloperControls,
        showDiscreetConnectivityNotice: false,
      }
    }

    return {
      kind: 'provisioning',
      fullScreen: true,
      kicker: 'Preparing connection',
      title: 'Preparing connection',
      message: 'This screen is requesting a connection code. No action is needed on this display.',
      statusText: 'Requesting connection code.',
      stateLabel: 'Preparing',
      showPairingCode: false,
      showProgress: true,
      showDeveloperControls,
      showDiscreetConnectivityNotice: false,
    }
  }

  if (status.state === 'PAIRING_CONFIRMED' || status.state === 'PAIRING_COMPLETING' || status.state === 'BOOTSTRAP_AUTH') {
    return {
      kind: 'provisioning',
      fullScreen: !hasPlayableContent(status),
      kicker: 'Provisioning',
      title: 'Completing secure setup',
      message: 'This screen is completing setup. No action is needed on this display.',
      statusText: 'Connection approved. Completing secure setup.',
      stateLabel: 'Provisioning',
      showPairingCode: false,
      showProgress: true,
      showDeveloperControls,
      showDiscreetConnectivityNotice: false,
    }
  }

  if (status.state === 'RECOVERY_REQUIRED' || status.state === 'HARD_RECOVERY') {
    return {
      kind: 'recovery',
      fullScreen: true,
      kicker: 'Administrator review',
      title: status.state === 'HARD_RECOVERY' ? 'Connection setup required' : 'Administrator review required',
      message:
        'This screen needs administrator review before normal service can resume. Playback will continue from stored content when available.',
      statusText: 'Administrator review required.',
      stateLabel: 'Review',
      showPairingCode: Boolean(status.pairingCode),
      showProgress: !status.pairingCode,
      showDeveloperControls,
      showDiscreetConnectivityNotice: false,
    }
  }

  return {
    kind: 'hidden',
    fullScreen: false,
    kicker: '',
    title: '',
    message: '',
    statusText: '',
    stateLabel: '',
    showPairingCode: false,
    showProgress: false,
    showDeveloperControls,
    showDiscreetConnectivityNotice: false,
  }
}

class PairingScreen {
  private pairingCodeElement: HTMLElement | null = null
  private pairingExpiryElement: HTMLElement | null = null
  private pairingCodeCard: HTMLElement | null = null
  private refreshButton: HTMLButtonElement | null = null
  private completeButton: HTMLButtonElement | null = null
  private statusElement: HTMLElement | null = null
  private diagnosticsList: HTMLElement | null = null
  private diagnosticsPanel: HTMLElement | null = null
  private pairingScreenElement: HTMLElement | null = null
  private deviceIdElement: HTMLElement | null = null
  private deviceLabelInput: HTMLInputElement | null = null
  private resolutionElement: HTMLElement | null = null
  private modelElement: HTMLElement | null = null
  private recoveryRetryButton: HTMLButtonElement | null = null
  private recoveryRepairButton: HTMLButtonElement | null = null
  private connectivityBanner: HTMLElement | null = null
  private devControls: HTMLElement | null = null
  private operatorKicker: HTMLElement | null = null
  private operatorTitle: HTMLElement | null = null
  private operatorMessage: HTMLElement | null = null
  private operatorProgress: HTMLElement | null = null
  private operatorFooterMessage: HTMLElement | null = null
  private operatorStatePill: HTMLElement | null = null
  private countdownTimer?: number
  private currentStatus: PlayerStatus | null = null
  private landingElapsed = false
  private runtimeMode: RuntimeMode = 'production'

  constructor() {
    this.initializeElements()
    this.setupEventListeners()
    this.startLandingTimer()
    this.populateDeviceInfo().catch((error) => {
      console.error('[Pairing] Failed to populate device info', error)
    })
    this.bootstrap().catch((error) => {
      console.error('[Pairing] Bootstrap failed', error)
    })
    this.runDiagnostics().catch((error) => {
      console.error('[Pairing] Diagnostics failed', error)
    })
  }

  private initializeElements(): void {
    this.pairingScreenElement = document.getElementById('pairing-screen')
    this.pairingCodeCard = document.getElementById('pairing-code-card')
    this.pairingCodeElement = document.getElementById('pairing-code')
    this.pairingExpiryElement = document.getElementById('pairing-expiry')
    this.refreshButton = document.getElementById('pairing-refresh') as HTMLButtonElement
    this.completeButton = document.getElementById('pairing-complete') as HTMLButtonElement
    this.statusElement = document.getElementById('pairing-status')
    this.diagnosticsList = document.getElementById('diagnostics-list')
    this.diagnosticsPanel = document.getElementById('network-diagnostics')
    this.deviceIdElement = document.getElementById('pairing-device-id')
    this.deviceLabelInput = document.getElementById('device-label') as HTMLInputElement
    this.resolutionElement = document.getElementById('device-resolution')
    this.modelElement = document.getElementById('device-model')
    this.recoveryRetryButton = document.getElementById('recovery-retry') as HTMLButtonElement
    this.recoveryRepairButton = document.getElementById('recovery-repair') as HTMLButtonElement
    this.connectivityBanner = document.getElementById('connectivity-banner')
    this.devControls = document.getElementById('dev-controls')
    this.operatorKicker = document.getElementById('operator-kicker')
    this.operatorTitle = document.getElementById('operator-title')
    this.operatorMessage = document.getElementById('operator-message')
    this.operatorProgress = document.getElementById('operator-progress')
    this.operatorFooterMessage = document.getElementById('operator-footer-message')
    this.operatorStatePill = document.getElementById('operator-state-pill')
  }

  private setupEventListeners(): void {
    this.refreshButton?.addEventListener('click', () => {
      void window.hexmon.playerAction('refresh-pairing', this.buildPairingRequestPayload())
    })

    this.completeButton?.addEventListener('click', () => {
      void window.hexmon.completePairing()
    })

    this.recoveryRetryButton?.addEventListener('click', () => {
      void window.hexmon.playerAction('retry-recovery')
    })

    this.recoveryRepairButton?.addEventListener('click', () => {
      void window.hexmon.playerAction('re-pair', this.buildPairingRequestPayload())
    })
  }

  private startLandingTimer(): void {
    window.setTimeout(() => {
      this.landingElapsed = true
      if (this.currentStatus) {
        this.render(this.currentStatus)
      }
    }, LANDING_DURATION_MS)
  }

  private async bootstrap(): Promise<void> {
    await this.loadRuntimeMode()
    const initialStatus = (await window.hexmon.getPlayerStatus()) as PlayerStatus
    this.render(initialStatus)

    window.hexmon.onPlayerStatus((data: unknown) => {
      this.render(data as PlayerStatus)
    })

    window.hexmon.onConfigChanged((config) => {
      this.runtimeMode = config.runtime?.mode || 'production'
      if (this.currentStatus) {
        this.render(this.currentStatus)
      }
    })
  }

  private async loadRuntimeMode(): Promise<void> {
    try {
      const config = await window.hexmon.getConfig()
      this.runtimeMode = config.runtime?.mode || 'production'
    } catch (error) {
      console.warn('[Pairing] Failed to load runtime mode', error)
    }
  }

  private async populateDeviceInfo(): Promise<void> {
    const info = await window.hexmon.getDeviceInfo()
    if (this.deviceLabelInput && info && typeof info === 'object') {
      const hostname = (info as { hostname?: string }).hostname || ''
      this.deviceLabelInput.value = hostname
    }

    const width = window.screen.width
    const height = window.screen.height
    if (this.resolutionElement) {
      this.resolutionElement.textContent = `${width} x ${height}`
    }

    if (this.modelElement && info && typeof info === 'object') {
      const typedInfo = info as { platform?: string; arch?: string }
      this.modelElement.textContent = `${typedInfo.platform || 'Unknown'} ${typedInfo.arch || ''}`.trim()
    }
  }

  private render(status: PlayerStatus): void {
    this.currentStatus = status
    const view = resolveKioskSurfaceView(status, {
      landingElapsed: this.landingElapsed,
      runtimeMode: this.runtimeMode,
    })

    this.renderOperatorSurface(status, view)
    this.renderConnectivity(view)
    this.renderSharedFields(status)
    this.startCountdowns()
  }

  private renderOperatorSurface(status: PlayerStatus, view: KioskSurfaceView): void {
    this.pairingScreenElement?.classList.toggle('hidden', !view.fullScreen)

    if (!view.fullScreen) {
      return
    }

    this.pairingScreenElement?.setAttribute('data-view', view.kind)
    this.setText(this.operatorKicker, view.kicker)
    this.setText(this.operatorTitle, view.title)
    this.setText(this.operatorMessage, view.message)
    this.setText(this.statusElement, view.statusText)
    this.setText(this.operatorFooterMessage, view.showDeveloperControls ? 'Developer controls are enabled for this session.' : 'This screen updates automatically.')
    this.setText(this.operatorStatePill, view.stateLabel)
    this.statusElement?.classList.toggle('success', status.state === 'PAIRING_CONFIRMED' || status.state === 'PAIRING_COMPLETING')
    this.statusElement?.classList.toggle('error', view.kind === 'backend-unavailable' || view.kind === 'setup-required')
    this.operatorProgress?.classList.toggle('hidden', !view.showProgress)

    this.pairingCodeCard?.classList.toggle('hidden', !view.showPairingCode)
    if (view.showPairingCode) {
      this.updatePairingCode(status.pairingCode || '------')
      this.updatePairingExpiry(status.pairingExpiresAt)
    }

    this.devControls?.classList.toggle('hidden', !view.showDeveloperControls)
    this.diagnosticsPanel?.classList.toggle('hidden', !view.showDeveloperControls)
    this.updateDeveloperControls(status, view)
  }

  private updateDeveloperControls(status: PlayerStatus, view: KioskSurfaceView): void {
    if (this.refreshButton) {
      this.refreshButton.disabled = view.kind === 'setup-required' || status.state === 'PAIRING_COMPLETING'
    }

    if (this.completeButton) {
      this.completeButton.disabled = status.state !== 'PAIRING_CONFIRMED'
      this.completeButton.classList.toggle('hidden', status.state !== 'PAIRING_CONFIRMED')
    }

    if (this.recoveryRetryButton) {
      this.recoveryRetryButton.disabled = status.state === 'HARD_RECOVERY'
    }

    if (this.recoveryRepairButton) {
      this.recoveryRepairButton.disabled = status.state === 'PAIRING_COMPLETING'
    }
  }

  private renderConnectivity(view: KioskSurfaceView): void {
    if (!this.connectivityBanner) {
      return
    }

    if (view.showDiscreetConnectivityNotice) {
      this.connectivityBanner.textContent = DISCREET_CONNECTIVITY_MESSAGE
      this.connectivityBanner.classList.remove('hidden')
      return
    }

    this.connectivityBanner.classList.add('hidden')
  }

  private renderSharedFields(status: PlayerStatus): void {
    if (this.deviceIdElement) {
      this.deviceIdElement.textContent = status.deviceId || 'Not connected'
    }
  }

  private buildPairingRequestPayload(): Partial<PairingCodeRequest> {
    const width = window.screen.width
    const height = window.screen.height
    const orientation = width >= height ? 'landscape' : 'portrait'
    const aspectRatio = this.getAspectRatio(width, height)

    return {
      device_label: this.deviceLabelInput?.value?.trim() || 'Hexmon Screen',
      width,
      height,
      orientation,
      aspect_ratio: aspectRatio,
      model: this.modelElement?.textContent || 'unknown',
      codecs: ['h264'],
      device_info: {
        os: navigator.userAgent,
      },
    }
  }

  private updatePairingCode(code: string): void {
    if (!this.pairingCodeElement) return
    this.pairingCodeElement.textContent = code.split('').join(' ')
  }

  private updatePairingExpiry(expiresAt?: string): void {
    if (!this.pairingExpiryElement) return
    if (!expiresAt) {
      this.pairingExpiryElement.textContent = 'Expires in --:--'
      return
    }

    this.pairingExpiryElement.textContent = this.formatDeadline(expiresAt, 'Expires in')
  }

  private startCountdowns(): void {
    if (this.countdownTimer) {
      window.clearInterval(this.countdownTimer)
      this.countdownTimer = undefined
    }

    this.countdownTimer = window.setInterval(() => {
      if (!this.currentStatus) {
        return
      }
      this.updatePairingExpiry(this.currentStatus.pairingExpiresAt)
    }, 1000)
  }

  private formatDeadline(deadline: string, prefix: string): string {
    const target = Date.parse(deadline)
    if (Number.isNaN(target)) {
      return `${prefix} --:--`
    }

    const remainingMs = target - Date.now()
    if (remainingMs <= 0) {
      return `${prefix} 0:00`
    }

    const totalSeconds = Math.floor(remainingMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${prefix} ${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  private async runDiagnostics(): Promise<void> {
    if (!this.diagnosticsList) return

    try {
      const diagnostics = await window.hexmon.getDiagnostics()
      const items: string[] = []
      items.push(this.createDiagnosticItem('Hostname', diagnostics.hostname || 'Unknown', true))
      items.push(this.createDiagnosticItem('IP Address', diagnostics.ipAddresses?.join(', ') || diagnostics.ipAddress, true))
      items.push(this.createDiagnosticItem('DNS Resolution', diagnostics.dnsResolution ? 'OK' : 'Failed', diagnostics.dnsResolution ?? false))
      items.push(this.createDiagnosticItem('API Reachable', diagnostics.apiReachable ? 'OK' : 'Failed', diagnostics.apiReachable ?? false))
      if (diagnostics.latency) {
        items.push(this.createDiagnosticItem('Latency', `${diagnostics.latency}ms`, true))
      }
      this.diagnosticsList.innerHTML = items.join('')
    } catch (error) {
      this.diagnosticsList.innerHTML = '<li>Diagnostics unavailable</li>'
    }
  }

  private createDiagnosticItem(label: string, value: string, status: boolean): string {
    const indicator = status ? 'online' : 'offline'
    return `
      <li>
        <span><span class="status-indicator ${indicator}"></span>${this.escapeHtml(label)}:</span>
        <span>${this.escapeHtml(value)}</span>
      </li>
    `
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  private setText(element: HTMLElement | null, text: string): void {
    if (element) {
      element.textContent = text
    }
  }

  private getAspectRatio(width: number, height: number): string {
    const divisor = this.getGreatestCommonDivisor(width, height)
    return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`
  }

  private getGreatestCommonDivisor(a: number, b: number): number {
    let x = Math.abs(a)
    let y = Math.abs(b)
    while (y !== 0) {
      const temp = y
      y = x % y
      x = temp
    }
    return x || 1
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new PairingScreen()
    })
  } else {
    new PairingScreen()
  }
}
