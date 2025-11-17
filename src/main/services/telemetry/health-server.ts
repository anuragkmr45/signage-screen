/**
 * Health Server - HTTP server for health and metrics endpoints
 * Provides /healthz and optional /metrics endpoints
 */

import * as http from 'http'
import { app } from 'electron'
import { getLogger } from '../../../common/logger'
import { HealthStatus } from '../../../common/types'
import { getSystemStatsCollector } from './system-stats'
import { getCacheManager } from '../cache/cache-manager'

const logger = getLogger('health-server')

export class HealthServer {
  private server?: http.Server
  private port = 3300
  private host = '127.0.0.1'
  private lastErrors: string[] = []
  private maxErrors = 10
  private lastScheduleSync?: string

  /**
   * Start health server
   */
  start(): void {
    if (this.server) {
      logger.warn('Health server already running')
      return
    }

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((error) => {
        logger.error({ error }, 'Error handling request')
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Internal server error' }))
      })
    })

    this.server.listen(this.port, this.host, () => {
      logger.info({ host: this.host, port: this.port }, 'Health server started')
    })

    this.server.on('error', (error) => {
      logger.error({ error }, 'Health server error')
    })
  }

  /**
   * Stop health server
   */
  stop(): void {
    if (!this.server) {
      return
    }

    logger.info('Stopping health server')

    this.server.close(() => {
      logger.info('Health server stopped')
    })

    this.server = undefined
  }

  /**
   * Handle HTTP request
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url || '/'

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    // Handle OPTIONS for CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Method not allowed' }))
      return
    }

    // Route requests
    if (url === '/healthz' || url === '/health') {
      await this.handleHealthCheck(res)
    } else if (url === '/metrics') {
      await this.handleMetrics(res)
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
    }
  }

  /**
   * Handle health check endpoint
   */
  private async handleHealthCheck(res: http.ServerResponse): Promise<void> {
    try {
      const health = await this.getHealthStatus()

      const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503

      res.writeHead(statusCode, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(health, null, 2))
    } catch (error) {
      logger.error({ error }, 'Failed to get health status')
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'unhealthy', error: (error as Error).message }))
    }
  }

  /**
   * Get health status
   */
  private async getHealthStatus(): Promise<HealthStatus> {
    const statsCollector = getSystemStatsCollector()
    const systemStats = await statsCollector.collect()

    const cacheManager = getCacheManager()
    const cacheUsage = await cacheManager.getStats()

    // Determine overall status
    let status: HealthStatus['status'] = 'healthy'

    // Check for degraded conditions
    if (systemStats.cpuUsage > 80 || systemStats.memoryUsage / systemStats.memoryTotal > 0.9) {
      status = 'degraded'
    }

    // Check for unhealthy conditions
    if (this.lastErrors.length > 5 || systemStats.diskUsage / systemStats.diskTotal > 0.95) {
      status = 'unhealthy'
    }

    return {
      status,
      appVersion: app.getVersion(),
      uptime: systemStats.uptime,
      lastScheduleSync: this.lastScheduleSync,
      cacheUsage,
      lastErrors: this.lastErrors.slice(-5), // Last 5 errors
      systemStats,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Handle metrics endpoint (Prometheus format)
   */
  private async handleMetrics(res: http.ServerResponse): Promise<void> {
    try {
      const metrics = await this.getPrometheusMetrics()

      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' })
      res.end(metrics)
    } catch (error) {
      logger.error({ error }, 'Failed to get metrics')
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('# Error generating metrics\n')
    }
  }

  /**
   * Get metrics in Prometheus format
   */
  private async getPrometheusMetrics(): Promise<string> {
    const statsCollector = getSystemStatsCollector()
    const systemStats = await statsCollector.collect()

    const cacheManager = getCacheManager()
    const cacheStats = await cacheManager.getStats()

    const metrics: string[] = []

    // System metrics
    metrics.push('# HELP hexmon_cpu_usage_percent CPU usage percentage')
    metrics.push('# TYPE hexmon_cpu_usage_percent gauge')
    metrics.push(`hexmon_cpu_usage_percent ${systemStats.cpuUsage}`)
    metrics.push('')

    metrics.push('# HELP hexmon_memory_usage_bytes Memory usage in bytes')
    metrics.push('# TYPE hexmon_memory_usage_bytes gauge')
    metrics.push(`hexmon_memory_usage_bytes ${systemStats.memoryUsage}`)
    metrics.push('')

    metrics.push('# HELP hexmon_memory_total_bytes Total memory in bytes')
    metrics.push('# TYPE hexmon_memory_total_bytes gauge')
    metrics.push(`hexmon_memory_total_bytes ${systemStats.memoryTotal}`)
    metrics.push('')

    metrics.push('# HELP hexmon_disk_usage_bytes Disk usage in bytes')
    metrics.push('# TYPE hexmon_disk_usage_bytes gauge')
    metrics.push(`hexmon_disk_usage_bytes ${systemStats.diskUsage}`)
    metrics.push('')

    metrics.push('# HELP hexmon_disk_total_bytes Total disk space in bytes')
    metrics.push('# TYPE hexmon_disk_total_bytes gauge')
    metrics.push(`hexmon_disk_total_bytes ${systemStats.diskTotal}`)
    metrics.push('')

    if (systemStats.temperature !== undefined) {
      metrics.push('# HELP hexmon_temperature_celsius CPU temperature in Celsius')
      metrics.push('# TYPE hexmon_temperature_celsius gauge')
      metrics.push(`hexmon_temperature_celsius ${systemStats.temperature}`)
      metrics.push('')
    }

    metrics.push('# HELP hexmon_uptime_seconds System uptime in seconds')
    metrics.push('# TYPE hexmon_uptime_seconds counter')
    metrics.push(`hexmon_uptime_seconds ${systemStats.uptime}`)
    metrics.push('')

    // Cache metrics
    metrics.push('# HELP hexmon_cache_used_bytes Cache used space in bytes')
    metrics.push('# TYPE hexmon_cache_used_bytes gauge')
    metrics.push(`hexmon_cache_used_bytes ${cacheStats.usedBytes}`)
    metrics.push('')

    metrics.push('# HELP hexmon_cache_total_bytes Cache total space in bytes')
    metrics.push('# TYPE hexmon_cache_total_bytes gauge')
    metrics.push(`hexmon_cache_total_bytes ${cacheStats.totalBytes}`)
    metrics.push('')

    metrics.push('# HELP hexmon_cache_entries_total Total number of cache entries')
    metrics.push('# TYPE hexmon_cache_entries_total gauge')
    metrics.push(`hexmon_cache_entries_total ${cacheStats.entryCount}`)
    metrics.push('')

    metrics.push('# HELP hexmon_cache_quarantined_total Number of quarantined cache entries')
    metrics.push('# TYPE hexmon_cache_quarantined_total gauge')
    metrics.push(`hexmon_cache_quarantined_total ${cacheStats.quarantinedCount}`)
    metrics.push('')

    return metrics.join('\n')
  }

  /**
   * Add error to error log
   */
  addError(error: string): void {
    this.lastErrors.push(error)
    if (this.lastErrors.length > this.maxErrors) {
      this.lastErrors.shift()
    }
  }

  /**
   * Update last schedule sync time
   */
  updateLastScheduleSync(): void {
    this.lastScheduleSync = new Date().toISOString()
  }

  /**
   * Get server address
   */
  getAddress(): string {
    return `http://${this.host}:${this.port}`
  }
}

// Singleton instance
let healthServer: HealthServer | null = null

export function getHealthServer(): HealthServer {
  if (!healthServer) {
    healthServer = new HealthServer()
  }
  return healthServer
}

