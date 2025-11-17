/**
 * Playback Engine - Main orchestrator for media playback
 * Coordinates timeline scheduling, media rendering, and transitions
 */

import { BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import { getLogger } from '../../../common/logger'
import { TimelineItem, EmergencyOverride, PlaybackError } from '../../../common/types'
import { getScheduleManager } from '../schedule-manager'
import { getCacheManager } from '../cache/cache-manager'
import { getProofOfPlayService } from '../pop-service'
import { getTelemetryService } from '../telemetry/telemetry-service'
import { TimelineScheduler, ScheduledItem } from './timeline-scheduler'

const logger = getLogger('playback-engine')

export type PlaybackState = 'stopped' | 'playing' | 'paused' | 'error' | 'emergency'

export class PlaybackEngine extends EventEmitter {
  private state: PlaybackState = 'stopped'
  private scheduler: TimelineScheduler
  private mainWindow?: BrowserWindow
  private currentItem?: TimelineItem
  private emergencyOverride?: EmergencyOverride
  private errorCount = 0
  private maxErrors = 5

  constructor() {
    super()
    this.scheduler = new TimelineScheduler()
    this.setupSchedulerListeners()
    this.setupScheduleManagerListeners()
  }

  /**
   * Initialize playback engine with main window
   */
  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow
    logger.info('Playback engine initialized')
  }

  /**
   * Start playback
   */
  async start(): Promise<void> {
    if (this.state === 'playing') {
      logger.warn('Playback already started')
      return
    }

    logger.info('Starting playback')

    try {
      // Get current schedule
      const scheduleManager = getScheduleManager()
      const schedule = scheduleManager.getCurrentSchedule()

      if (!schedule || schedule.items.length === 0) {
        throw new Error('No schedule available')
      }

      // Check for emergency override
      const emergency = scheduleManager.getEmergencyOverride()
      if (emergency && emergency.active) {
        await this.handleEmergencyOverride(emergency)
        return
      }

      // Start timeline
      this.state = 'playing'
      this.scheduler.start(schedule.items)

      this.emit('playback-started')
      logger.info({ scheduleId: schedule.id, itemCount: schedule.items.length }, 'Playback started')
    } catch (error) {
      logger.error({ error }, 'Failed to start playback')
      this.state = 'error'
      this.handleError(error as Error)
      throw error
    }
  }

  /**
   * Stop playback
   */
  stop(): void {
    logger.info('Stopping playback')

    this.scheduler.stop()
    this.state = 'stopped'
    this.currentItem = undefined

    this.emit('playback-stopped')
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.state !== 'playing') {
      return
    }

    logger.info('Pausing playback')

    this.scheduler.pause()
    this.state = 'paused'

    this.emit('playback-paused')
  }

  /**
   * Resume playback
   */
  resume(): void {
    if (this.state !== 'paused') {
      return
    }

    logger.info('Resuming playback')

    this.scheduler.resume()
    this.state = 'playing'

    this.emit('playback-resumed')
  }

  /**
   * Handle emergency override
   */
  private async handleEmergencyOverride(override: EmergencyOverride): Promise<void> {
    logger.warn({ overrideId: override.id }, 'Handling emergency override')

    this.emergencyOverride = override
    this.state = 'emergency'

    // Stop current playback
    this.scheduler.stop()

    // Play emergency content
    const emergencyItems = [override.content]
    this.scheduler.start(emergencyItems)

    this.emit('emergency-override-active', override)
  }

  /**
   * Clear emergency override
   */
  private clearEmergencyOverride(): void {
    if (!this.emergencyOverride) {
      return
    }

    logger.info({ overrideId: this.emergencyOverride.id }, 'Clearing emergency override')

    this.emergencyOverride = undefined
    this.state = 'stopped'

    // Restart normal playback
    this.start().catch((error) => {
      logger.error({ error }, 'Failed to restart playback after emergency')
    })

    this.emit('emergency-override-cleared')
  }

  /**
   * Setup scheduler listeners
   */
  private setupSchedulerListeners(): void {
    this.scheduler.on('play-item', (scheduledItem: ScheduledItem) => {
      this.handlePlayItem(scheduledItem).catch((error) => {
        logger.error({ error, itemId: scheduledItem.item.id }, 'Failed to play item')
        this.handleError(error as Error)
      })
    })

    this.scheduler.on('item-complete', (scheduledItem: ScheduledItem) => {
      this.handleItemComplete(scheduledItem)
    })

    this.scheduler.on('transition-start', (current: ScheduledItem, next?: ScheduledItem) => {
      this.handleTransitionStart(current, next)
    })

    this.scheduler.on('timeline-complete', () => {
      logger.debug('Timeline completed, will loop')
    })
  }

  /**
   * Setup schedule manager listeners
   */
  private setupScheduleManagerListeners(): void {
    const scheduleManager = getScheduleManager()

    scheduleManager.on('schedule-updated', () => {
      logger.info('Schedule updated, restarting playback')
      this.stop()
      this.start().catch((error) => {
        logger.error({ error }, 'Failed to restart playback after schedule update')
      })
    })

    scheduleManager.on('emergency-override', (override: EmergencyOverride) => {
      this.handleEmergencyOverride(override).catch((error) => {
        logger.error({ error }, 'Failed to handle emergency override')
      })
    })

    scheduleManager.on('emergency-cleared', () => {
      this.clearEmergencyOverride()
    })
  }

  /**
   * Handle play item
   */
  private async handlePlayItem(scheduledItem: ScheduledItem): Promise<void> {
    const item = scheduledItem.item
    this.currentItem = item

    logger.info(
      {
        itemId: item.id,
        type: item.type,
        displayMs: item.displayMs,
      },
      'Playing item'
    )

    // Mark as now-playing in cache
    if (item.objectKey) {
      const cacheManager = getCacheManager()
      cacheManager.markNowPlaying(item.objectKey)
    }

    // Record proof-of-play start
    const scheduleManager = getScheduleManager()
    const schedule = scheduleManager.getCurrentSchedule()
    if (schedule) {
      const popService = getProofOfPlayService()
      popService.recordStart(schedule.id, item.id)
    }

    // Update telemetry
    const telemetryService = getTelemetryService()
    telemetryService.setCurrentMedia(item.id)

    // Send to renderer
    if (this.mainWindow) {
      this.mainWindow.webContents.send('play-media', {
        item,
        scheduledItem,
      })
    }

    this.emit('item-playing', item)
  }

  /**
   * Handle item complete
   */
  private handleItemComplete(scheduledItem: ScheduledItem): void {
    const item = scheduledItem.item

    logger.debug({ itemId: item.id }, 'Item completed')

    // Unmark as now-playing in cache
    if (item.objectKey) {
      const cacheManager = getCacheManager()
      cacheManager.unmarkNowPlaying(item.objectKey)
    }

    // Record proof-of-play end
    const scheduleManager = getScheduleManager()
    const schedule = scheduleManager.getCurrentSchedule()
    if (schedule) {
      const popService = getProofOfPlayService()
      popService.recordEnd(schedule.id, item.id, true)
    }

    this.emit('item-completed', item)
  }

  /**
   * Handle transition start
   */
  private handleTransitionStart(current: ScheduledItem, next?: ScheduledItem): void {
    logger.debug(
      {
        currentId: current.item.id,
        nextId: next?.item.id,
      },
      'Transition starting'
    )

    if (this.mainWindow && next) {
      this.mainWindow.webContents.send('transition-start', {
        current: current.item,
        next: next.item,
        durationMs: current.item.transitionDurationMs || 0,
      })
    }

    this.emit('transition-start', current.item, next?.item)
  }

  /**
   * Handle playback error
   */
  private handleError(error: Error): void {
    this.errorCount++

    logger.error({ error, errorCount: this.errorCount }, 'Playback error')

    const telemetryService = getTelemetryService()
    telemetryService.reportError(error.message)

    if (this.errorCount >= this.maxErrors) {
      logger.error('Max errors reached, stopping playback')
      this.stop()
      this.state = 'error'
      this.emit('playback-error', new PlaybackError('Max errors reached', { error: error.message }))
    } else {
      // Show fallback slide
      if (this.mainWindow) {
        this.mainWindow.webContents.send('show-fallback', {
          message: error.message,
        })
      }
    }
  }

  /**
   * Get current state
   */
  getState(): PlaybackState {
    return this.state
  }

  /**
   * Get current item
   */
  getCurrentItem(): TimelineItem | undefined {
    return this.currentItem
  }

  /**
   * Get jitter statistics
   */
  getJitterStats() {
    return this.scheduler.getJitterStats()
  }
}

// Singleton instance
let playbackEngine: PlaybackEngine | null = null

export function getPlaybackEngine(): PlaybackEngine {
  if (!playbackEngine) {
    playbackEngine = new PlaybackEngine()
  }
  return playbackEngine
}

