/**
 * Player - Main playback UI controller
 * Handles media rendering and transitions in the renderer process
 */

import { TimelineItem, FitMode } from '../common/types'
import './types'

class Player {
  private canvas: HTMLCanvasElement | null = null
  private currentElement?: HTMLElement
  private mediaContainer: HTMLElement | null = null

  constructor() {
    this.initializeElements()
    this.setupIPC()
    this.log('info', 'Player initialized')
  }

  /**
   * Initialize DOM elements
   */
  private initializeElements(): void {
    this.canvas = document.getElementById('media-canvas') as HTMLCanvasElement
    this.mediaContainer = document.getElementById('playback-container')

    if (this.canvas) {
      this.resizeCanvas()

      // Handle window resize
      window.addEventListener('resize', () => this.resizeCanvas())
    }
  }

  /**
   * Resize canvas to window size
   */
  private resizeCanvas(): void {
    if (!this.canvas) return

    this.canvas.width = window.innerWidth
    this.canvas.height = window.innerHeight
  }

  /**
   * Setup IPC listeners
   */
  private setupIPC(): void {
    // Listen for media playback events
    if (window.hexmon && window.hexmon.onMediaChange) {
      window.hexmon.onMediaChange((data: any) => {
        this.log('debug', 'Received play-media event', data)
        this.playMedia(data.item).catch((error) => {
          this.log('error', 'Failed to play media', { error: error.message })
          this.showFallback(error.message)
        })
      })
    }

    // Listen for transition events
    if (window.hexmon && window.hexmon.onPlaybackUpdate) {
      window.hexmon.onPlaybackUpdate((data: any) => {
        if (data.type === 'transition-start') {
          this.log('debug', 'Received transition-start event', data)
          this.startTransition(data.current, data.next, data.durationMs)
        } else if (data.type === 'show-fallback') {
          this.log('warn', 'Received show-fallback event', data)
          this.showFallback(data.message)
        }
      })
    }
  }

  /**
   * Play media item
   */
  private async playMedia(item: TimelineItem): Promise<void> {
    this.log('info', 'Playing media', { itemId: item.id, type: item.type })

    try {
      let element: HTMLElement

      switch (item.type) {
        case 'image':
          element = await this.renderImage(item)
          break
        case 'video':
          element = await this.renderVideo(item)
          break
        case 'pdf':
          element = await this.renderPDF(item)
          break
        case 'url':
          element = await this.renderURL(item)
          break
        default:
          throw new Error(`Unsupported media type: ${item.type}`)
      }

      // Apply fit mode
      this.applyFitMode(element, item.fit)

      // Show element
      this.showElement(element)

      this.currentElement = element
    } catch (error) {
      this.log('error', 'Failed to play media', { error: (error as Error).message })
      throw error
    }
  }

  /**
   * Render image
   */
  private async renderImage(item: TimelineItem): Promise<HTMLElement> {
    return new Promise((resolve, reject) => {
      const img = document.createElement('img')
      img.style.position = 'absolute'
      img.style.top = '0'
      img.style.left = '0'
      img.style.width = '100%'
      img.style.height = '100%'

      img.onload = () => {
        this.log('debug', 'Image loaded', { itemId: item.id })
        resolve(img)
      }

      img.onerror = () => {
        reject(new Error(`Failed to load image: ${item.objectKey || item.url}`))
      }

      // Set source (from cache or URL)
      img.src = this.getMediaSource(item)
    })
  }

  /**
   * Render video
   */
  private async renderVideo(item: TimelineItem): Promise<HTMLElement> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.style.position = 'absolute'
      video.style.top = '0'
      video.style.left = '0'
      video.style.width = '100%'
      video.style.height = '100%'
      video.muted = item.muted
      video.loop = false

      video.onloadeddata = () => {
        this.log('debug', 'Video loaded', { itemId: item.id })
        video.play().catch((error) => {
          this.log('error', 'Failed to play video', { error: error.message })
        })
        resolve(video)
      }

      video.onerror = () => {
        reject(new Error(`Failed to load video: ${item.objectKey || item.url}`))
      }

      video.src = this.getMediaSource(item)
    })
  }

  /**
   * Render PDF
   */
  private async renderPDF(_item: TimelineItem): Promise<HTMLElement> {
    const container = document.createElement('div')
    container.style.position = 'absolute'
    container.style.top = '0'
    container.style.left = '0'
    container.style.width = '100%'
    container.style.height = '100%'
    container.style.backgroundColor = '#fff'
    container.style.overflow = 'hidden'

    // TODO: Integrate pdf.js for actual PDF rendering
    // For now, show placeholder
    const placeholder = document.createElement('div')
    placeholder.style.display = 'flex'
    placeholder.style.alignItems = 'center'
    placeholder.style.justifyContent = 'center'
    placeholder.style.width = '100%'
    placeholder.style.height = '100%'
    placeholder.style.fontSize = '24px'
    placeholder.textContent = 'PDF Rendering (pdf.js integration needed)'

    container.appendChild(placeholder)

    return container
  }

  /**
   * Render URL
   */
  private async renderURL(item: TimelineItem): Promise<HTMLElement> {
    const webview = document.createElement('webview')
    webview.style.position = 'absolute'
    webview.style.top = '0'
    webview.style.left = '0'
    webview.style.width = '100%'
    webview.style.height = '100%'

    if (item.url) {
      webview.src = item.url
    }

    return webview
  }

  /**
   * Get media source (from cache or URL)
   */
  private getMediaSource(item: TimelineItem): string {
    // In production, this would get the local cached file path
    // For now, use URL or construct path from objectKey
    if (item.url) {
      return item.url
    }

    if (item.objectKey) {
      // This would be the cached file path
      return `/cache/${item.objectKey}`
    }

    throw new Error('No media source available')
  }

  /**
   * Apply fit mode to element
   */
  private applyFitMode(element: HTMLElement, fit: FitMode): void {
    switch (fit) {
      case 'contain':
        element.style.objectFit = 'contain'
        break
      case 'cover':
        element.style.objectFit = 'cover'
        break
      case 'stretch':
        element.style.objectFit = 'fill'
        break
    }
  }

  /**
   * Show element with fade in
   */
  private showElement(element: HTMLElement): void {
    if (!this.mediaContainer) return

    // Hide current element
    if (this.currentElement) {
      this.currentElement.style.opacity = '0'
      setTimeout(() => {
        if (this.currentElement && this.mediaContainer) {
          this.mediaContainer.removeChild(this.currentElement)
        }
      }, 500)
    }

    // Add and show new element
    element.style.opacity = '0'
    this.mediaContainer.appendChild(element)

    requestAnimationFrame(() => {
      element.style.transition = 'opacity 500ms ease-in-out'
      element.style.opacity = '1'
    })
  }

  /**
   * Start transition between items
   */
  private startTransition(current: TimelineItem, next: TimelineItem, durationMs: number): void {
    this.log('debug', 'Starting transition', { currentId: current.id, nextId: next.id, durationMs })

    // Preload next item
    this.playMedia(next).catch((error) => {
      this.log('error', 'Failed to preload next item', { error: error.message })
    })
  }

  /**
   * Show fallback slide
   */
  private showFallback(message: string): void {
    if (!this.mediaContainer) return

    const fallback = document.createElement('div')
    fallback.className = 'fallback-slide'

    const icon = document.createElement('div')
    icon.className = 'fallback-icon'
    icon.textContent = '⚠️'

    const msg = document.createElement('div')
    msg.className = 'fallback-message'
    msg.textContent = message || 'An error occurred during playback'

    fallback.appendChild(icon)
    fallback.appendChild(msg)

    this.showElement(fallback)
  }

  /**
   * Log message to main process
   */
  private log(level: string, message: string, data?: any): void {
    if (window.hexmon && window.hexmon.log) {
      window.hexmon.log(level, message, data)
    } else {
      console.log(`[${level}] ${message}`, data)
    }
  }
}

// Initialize player when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new Player()
  })
} else {
  new Player()
}

