/**
 * Pairing Screen Logic
 * Handles device pairing UI and network diagnostics
 */

// Import shared types
import './types'

class PairingScreen {
  private inputs: HTMLInputElement[] = []
  private pairButton: HTMLButtonElement | null = null
  private statusElement: HTMLElement | null = null
  private diagnosticsList: HTMLElement | null = null
  private pairingScreenElement: HTMLElement | null = null

  constructor() {
    this.initializeElements()
    this.setupEventListeners()
    this.checkPairingStatus()
    this.runDiagnostics()
  }

  /**
   * Initialize DOM elements
   */
  private initializeElements(): void {
    this.pairingScreenElement = document.getElementById('pairing-screen')

    // Get code inputs
    for (let i = 1; i <= 6; i++) {
      const input = document.getElementById(`code-${i}`) as HTMLInputElement
      if (input) {
        this.inputs.push(input)
      }
    }

    this.pairButton = document.getElementById('pair-button') as HTMLButtonElement
    this.statusElement = document.getElementById('pairing-status')
    this.diagnosticsList = document.getElementById('diagnostics-list')
  }

  /**
   * Check pairing status and show/hide screen accordingly
   */
  private async checkPairingStatus(): Promise<void> {
    try {
      const status = await window.hexmon.getPairingStatus()
      if (!status.paired) {
        // Device not paired, show pairing screen
        this.showPairingScreen()
      } else {
        // Device is paired, hide pairing screen
        this.hidePairingScreen()
      }
    } catch (error) {
      console.error('[Pairing] Failed to check pairing status:', error)
      // On error, show pairing screen to be safe
      this.showPairingScreen()
    }
  }

  /**
   * Show the pairing screen
   */
  private showPairingScreen(): void {
    if (this.pairingScreenElement) {
      this.pairingScreenElement.classList.remove('hidden')
      // Focus first input
      if (this.inputs.length > 0) {
        this.inputs[0]?.focus()
      }
    }
  }

  /**
   * Hide the pairing screen
   */
  private hidePairingScreen(): void {
    if (this.pairingScreenElement) {
      this.pairingScreenElement.classList.add('hidden')
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Auto-focus next input
    this.inputs.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement
        const value = target.value.toUpperCase()

        // Only allow alphanumeric
        if (!/^[A-Z0-9]$/.test(value)) {
          target.value = ''
          return
        }

        target.value = value

        // Move to next input
        if (value && index < this.inputs.length - 1) {
          this.inputs[index + 1]?.focus()
        }

        // Enable button if all filled
        this.updateButtonState()
      })

      // Handle backspace
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && index > 0) {
          this.inputs[index - 1]?.focus()
        }
      })

      // Handle paste
      input.addEventListener('paste', (e) => {
        e.preventDefault()
        const pastedData = e.clipboardData?.getData('text').toUpperCase() || ''
        const chars = pastedData.replace(/[^A-Z0-9]/g, '').split('')

        chars.forEach((char, i) => {
          const targetIndex = index + i
          if (targetIndex < this.inputs.length) {
            const targetInput = this.inputs[targetIndex]
            if (targetInput) {
              targetInput.value = char
            }
          }
        })

        // Focus last filled input
        const lastIndex = Math.min(index + chars.length, this.inputs.length - 1)
        this.inputs[lastIndex]?.focus()

        this.updateButtonState()
      })
    })

    // Pair button click
    this.pairButton?.addEventListener('click', () => {
      this.submitPairing()
    })

    // Enter key to submit
    this.inputs.forEach((input) => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && this.isPairingCodeComplete()) {
          this.submitPairing()
        }
      })
    })
  }

  /**
   * Update button state
   */
  private updateButtonState(): void {
    if (this.pairButton) {
      this.pairButton.disabled = !this.isPairingCodeComplete()
    }
  }

  /**
   * Check if pairing code is complete
   */
  private isPairingCodeComplete(): boolean {
    return this.inputs.every((input) => input.value.length === 1)
  }

  /**
   * Get pairing code
   */
  private getPairingCode(): string {
    return this.inputs.map((input) => input.value).join('')
  }

  /**
   * Submit pairing
   */
  private async submitPairing(): Promise<void> {
    const code = this.getPairingCode()

    if (!this.isPairingCodeComplete()) {
      this.showStatus('Please enter all 6 characters', 'error')
      return
    }

    this.showStatus('Pairing device...', '')
    this.setInputsEnabled(false)

    if (this.pairButton) {
      this.pairButton.disabled = true
      this.pairButton.textContent = 'Pairing...'
    }

    try {
      const response = await window.hexmon.submitPairingCode(code)
      this.showStatus(`Successfully paired! Device ID: ${response.device_id}`, 'success')

      // Reload after successful pairing
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Pairing failed'
      this.showStatus(errorMessage, 'error')
      this.setInputsEnabled(true)

      if (this.pairButton) {
        this.pairButton.disabled = false
        this.pairButton.textContent = 'Pair Device'
      }
    }
  }

  /**
   * Show status message
   */
  private showStatus(message: string, type: 'success' | 'error' | ''): void {
    if (!this.statusElement) return

    this.statusElement.textContent = message
    this.statusElement.className = `pairing-status ${type}`
  }

  /**
   * Enable/disable inputs
   */
  private setInputsEnabled(enabled: boolean): void {
    this.inputs.forEach((input) => {
      input.disabled = !enabled
    })
  }

  /**
   * Run network diagnostics
   */
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
      console.error('Failed to run diagnostics:', error)
      this.diagnosticsList.innerHTML = '<li>Failed to run diagnostics</li>'
    }
  }

  /**
   * Create diagnostic item HTML
   */
  private createDiagnosticItem(label: string, value: string, status: boolean): string {
    const indicator = status ? 'online' : 'offline'
    return `
      <li>
        <span><span class="status-indicator ${indicator}"></span>${label}:</span>
        <span>${value}</span>
      </li>
    `
  }
}

// Initialize pairing screen when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new PairingScreen()
  })
} else {
  new PairingScreen()
}

