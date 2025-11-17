/**
 * System Stats - Collect CPU, RAM, disk, network, and temperature stats
 */

import * as os from 'os'
import * as fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import { getLogger } from '../../../common/logger'
import { SystemStats, NetworkInterface } from '../../../common/types'
import { getDiskUsage } from '../../../common/utils'

const execAsync = promisify(exec)
const logger = getLogger('system-stats')

export class SystemStatsCollector {
  private lastCpuUsage: { idle: number; total: number } | null = null

  /**
   * Collect all system stats
   */
  async collect(): Promise<SystemStats> {
    const [cpuUsage, memoryUsage, diskUsage, temperature, networkInterfaces] = await Promise.all([
      this.getCPUUsage(),
      this.getMemoryUsage(),
      this.getDiskUsage(),
      this.getTemperature(),
      this.getNetworkInterfaces(),
    ])

    return {
      cpuUsage,
      memoryUsage: memoryUsage.used,
      memoryTotal: memoryUsage.total,
      diskUsage: diskUsage.used,
      diskTotal: diskUsage.total,
      temperature,
      uptime: os.uptime(),
      networkInterfaces,
    }
  }

  /**
   * Get CPU usage percentage
   */
  async getCPUUsage(): Promise<number> {
    const cpus = os.cpus()
    let idle = 0
    let total = 0

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        total += cpu.times[type as keyof typeof cpu.times]
      }
      idle += cpu.times.idle
    }

    if (this.lastCpuUsage) {
      const idleDiff = idle - this.lastCpuUsage.idle
      const totalDiff = total - this.lastCpuUsage.total
      const usage = 100 - (100 * idleDiff) / totalDiff
      this.lastCpuUsage = { idle, total }
      return Math.round(usage * 100) / 100
    }

    this.lastCpuUsage = { idle, total }
    return 0
  }

  /**
   * Get memory usage
   */
  getMemoryUsage(): { used: number; total: number; free: number } {
    const total = os.totalmem()
    const free = os.freemem()
    const used = total - free

    return { used, total, free }
  }

  /**
   * Get disk usage
   */
  async getDiskUsage(): Promise<{ used: number; total: number; free: number }> {
    try {
      const homedir = os.homedir()
      return await getDiskUsage(homedir)
    } catch (error) {
      logger.error({ error }, 'Failed to get disk usage')
      return { used: 0, total: 0, free: 0 }
    }
  }

  /**
   * Get CPU temperature (Linux only)
   */
  async getTemperature(): Promise<number | undefined> {
    if (os.platform() !== 'linux') {
      return undefined
    }

    try {
      // Try reading from thermal zone
      const thermalPath = '/sys/class/thermal/thermal_zone0/temp'
      if (fs.existsSync(thermalPath)) {
        const temp = fs.readFileSync(thermalPath, 'utf-8')
        return parseInt(temp, 10) / 1000 // Convert from millidegrees
      }

      // Try using sensors command
      const { stdout } = await execAsync('sensors -u 2>/dev/null | grep temp1_input | head -1 | awk \'{print $2}\'')
      const temp = parseFloat(stdout.trim())
      if (!isNaN(temp)) {
        return temp
      }
    } catch (error) {
      logger.debug({ error }, 'Failed to get temperature')
    }

    return undefined
  }

  /**
   * Get network interfaces
   */
  getNetworkInterfaces(): NetworkInterface[] {
    const interfaces = os.networkInterfaces()
    const result: NetworkInterface[] = []

    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name]
      if (!iface) continue

      for (const addr of iface) {
        result.push({
          name,
          address: addr.address,
          netmask: addr.netmask,
          family: addr.family as 'IPv4' | 'IPv6',
          internal: addr.internal,
        })
      }
    }

    return result
  }

  /**
   * Get load average (Unix only)
   */
  getLoadAverage(): number[] {
    return os.loadavg()
  }

  /**
   * Get platform info
   */
  getPlatformInfo(): {
    platform: string
    arch: string
    release: string
    hostname: string
  } {
    return {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
    }
  }
}

// Singleton instance
let statsCollector: SystemStatsCollector | null = null

export function getSystemStatsCollector(): SystemStatsCollector {
  if (!statsCollector) {
    statsCollector = new SystemStatsCollector()
  }
  return statsCollector
}

