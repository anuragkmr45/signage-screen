/**
 * Test setup and global configuration
 * Runs before all tests
 */

import * as path from 'path'
import * as fs from 'fs'

// Set test environment
process.env.NODE_ENV = 'test'
process.env.HEXMON_CONFIG_PATH = path.join(__dirname, 'fixtures', 'test-config.json')

// Create test directories
const testDirs = [
  path.join(__dirname, 'fixtures'),
  path.join(__dirname, 'fixtures', 'cache'),
  path.join(__dirname, 'fixtures', 'certs'),
  path.join(__dirname, 'fixtures', 'logs'),
]

for (const dir of testDirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// Suppress console output during tests (optional)
if (process.env.SUPPRESS_LOGS === 'true') {
  console.log = () => {}
  console.info = () => {}
  console.warn = () => {}
  console.error = () => {}
}

// Global test timeout
const DEFAULT_TIMEOUT = 5000
if (typeof global.setTimeout !== 'undefined') {
  ;(global as any).testTimeout = DEFAULT_TIMEOUT
}

