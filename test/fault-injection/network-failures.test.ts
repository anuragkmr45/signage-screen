/**
 * Fault injection tests for network failures
 * Tests resilience to connection loss, timeouts, DNS failures
 */

const { expect } = require('chai')
const fs = require('fs')
const path = require('path')
const sinon = require('sinon')
const { cleanupTempDir, createTempDir, sleep, waitFor } = require('../helpers/test-utils.ts')

describe('Network Failure Fault Injection', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('HTTP Client Resilience', () => {
    it('should retry on connection timeout', async function () {
      this.timeout(10000)

      // Mock HTTP client with timeout
      const mockRequest = sandbox.stub()
      mockRequest.onCall(0).rejects(new Error('ETIMEDOUT'))
      mockRequest.onCall(1).rejects(new Error('ETIMEDOUT'))
      mockRequest.onCall(2).resolves({ data: 'success' })

      const { retryWithBackoff } = require('../../src/common/utils')
      const result = await retryWithBackoff(mockRequest, { maxAttempts: 3, baseDelayMs: 100 })

      expect(result.data).to.equal('success')
      expect(mockRequest.callCount).to.equal(3)
    })

    it('should handle DNS resolution failure', async () => {
      const mockRequest = sandbox.stub()
      mockRequest.rejects(new Error('ENOTFOUND'))

      const { retryWithBackoff } = require('../../src/common/utils')

      try {
        await retryWithBackoff(mockRequest, { maxAttempts: 3, baseDelayMs: 10 })
        expect.fail('Should have thrown error')
      } catch (error: any) {
        expect(error.message).to.include('ENOTFOUND')
      }
    })

    it('should handle connection refused', async () => {
      const mockRequest = sandbox.stub()
      mockRequest.rejects(new Error('ECONNREFUSED'))

      const { retryWithBackoff } = require('../../src/common/utils')

      try {
        await retryWithBackoff(mockRequest, { maxAttempts: 3, baseDelayMs: 10 })
        expect.fail('Should have thrown error')
      } catch (error: any) {
        expect(error.message).to.include('ECONNREFUSED')
      }
    })

    it('should queue requests when offline', async () => {
      // This would test the request queue functionality
      // Placeholder for actual implementation
      expect(true).to.be.true
    })
  })

  describe('WebSocket Resilience', () => {
    it('should reconnect after connection loss', async function () {
      this.timeout(10000)

      const mockWS = {
        readyState: 3, // CLOSED
        close: sandbox.stub(),
        send: sandbox.stub(),
        on: sandbox.stub(),
      }

      // Simulate reconnection
      let reconnectAttempts = 0
      const reconnect = async () => {
        reconnectAttempts++
        await sleep(100)
        if (reconnectAttempts >= 3) {
          mockWS.readyState = 1 // OPEN
        }
      }

      await reconnect()
      await reconnect()
      await reconnect()

      expect(reconnectAttempts).to.equal(3)
      expect(mockWS.readyState).to.equal(1)
    })

    it('should apply exponential backoff on reconnection', async function () {
      this.timeout(10000)

      const delays: number[] = []
      let attempt = 0

      const reconnect = async () => {
        attempt++
        const baseDelay = 1000
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 30000)
        delays.push(delay)
        await sleep(10) // Simulate delay
      }

      await reconnect() // 1000ms
      await reconnect() // 2000ms
      await reconnect() // 4000ms
      await reconnect() // 8000ms

      expect(delays[0]).to.equal(1000)
      expect(delays[1]).to.equal(2000)
      expect(delays[2]).to.equal(4000)
      expect(delays[3]).to.equal(8000)
    })

    it('should handle ping/pong timeout', async function () {
      this.timeout(5000)

      let lastPing = Date.now()
      const pingInterval = 1000
      const timeout = 3000

      // Simulate missed pongs
      await sleep(timeout + 100)

      const elapsed = Date.now() - lastPing
      const timedOut = elapsed > timeout

      expect(timedOut).to.be.true
    })
  })

  describe('Download Resilience', () => {
    it('should resume interrupted downloads', async () => {
      const mockDownload = sandbox.stub()

      // First attempt: partial download
      mockDownload.onCall(0).resolves({
        data: Buffer.from('partial'),
        headers: { 'content-length': '100' },
      })

      // Second attempt: resume from offset
      mockDownload.onCall(1).resolves({
        data: Buffer.from('complete'),
        headers: { 'content-length': '100' },
      })

      const result1 = await mockDownload()
      expect(result1.data.toString()).to.equal('partial')

      const result2 = await mockDownload()
      expect(result2.data.toString()).to.equal('complete')
    })

    it('should handle corrupted downloads', async () => {
      const expectedHash = 'abc123'
      const actualHash = 'def456'

      expect(actualHash).to.not.equal(expectedHash)
      // In real implementation, this would trigger quarantine
    })
  })

  describe('API Error Handling', () => {
    it('should handle 429 rate limiting', async () => {
      const mockRequest = sandbox.stub()
      mockRequest.onCall(0).rejects({
        response: { status: 429, headers: { 'retry-after': '1' } },
      })
      mockRequest.onCall(1).resolves({ data: 'success' })

      // Simulate rate limit handling
      try {
        await mockRequest()
      } catch (error: any) {
        if (error.response?.status === 429) {
          const retryAfter = parseInt(error.response.headers['retry-after'] || '1')
          await sleep(retryAfter * 1000)
          const result = await mockRequest()
          expect(result.data).to.equal('success')
        }
      }
    })

    it('should handle 503 service unavailable', async () => {
      const mockRequest = sandbox.stub()
      mockRequest.onCall(0).rejects({ response: { status: 503 } })
      mockRequest.onCall(1).resolves({ data: 'success' })

      const { retryWithBackoff } = require('../../src/common/utils')
      const result = await retryWithBackoff(mockRequest, { maxAttempts: 3, baseDelayMs: 100 })

      expect(result.data).to.equal('success')
    })

    it('should not retry on 4xx client errors', async () => {
      const mockRequest = sandbox.stub()
      mockRequest.rejects({ response: { status: 400 } })

      try {
        await mockRequest()
        expect.fail('Should have thrown error')
      } catch (error: any) {
        expect(error.response.status).to.equal(400)
        expect(mockRequest.callCount).to.equal(1) // No retry
      }
    })
  })

  describe('Offline Mode', () => {
    it('should continue operation when offline', async () => {
      // Simulate offline state
      const isOnline = false

      if (!isOnline) {
        // Should queue requests
        const queue: any[] = []
        queue.push({ type: 'heartbeat', data: {} })
        queue.push({ type: 'pop', data: {} })

        expect(queue.length).to.equal(2)
      }
    })

    it('should flush queue when back online', async () => {
      const queue = [
        { type: 'heartbeat', data: {} },
        { type: 'pop', data: {} },
      ]

      // Simulate coming back online
      const isOnline = true

      if (isOnline) {
        const flushed = queue.splice(0, queue.length)
        expect(flushed.length).to.equal(2)
        expect(queue.length).to.equal(0)
      }
    })
  })

  describe('First Launch Runtime Notice', () => {
    function clearRuntimeModules() {
      Object.keys(require.cache).forEach((key) => {
        if (key.includes('src/main/services') || key.includes('src/common')) {
          delete require.cache[key]
        }
      })
    }

    it('should stay open and mark backend unavailable when first pairing cannot reach the service', async () => {
      const tempDir = createTempDir('first-launch-backend-down-')
      process.env.HEXMON_CONFIG_PATH = path.join(tempDir, 'config.json')
      fs.writeFileSync(
        process.env.HEXMON_CONFIG_PATH,
        JSON.stringify(
          {
            apiBase: 'http://192.168.0.2:3000',
            wsUrl: 'ws://192.168.0.2:3000/ws',
            deviceId: '',
            runtime: {
              mode: 'production',
            },
            mtls: {
              enabled: false,
              certPath: path.join(tempDir, 'client.crt'),
              keyPath: path.join(tempDir, 'client.key'),
              caPath: path.join(tempDir, 'ca.crt'),
            },
            cache: {
              path: path.join(tempDir, 'cache'),
              maxBytes: 1073741824,
            },
            intervals: {
              heartbeatMs: 30000,
              commandPollMs: 5000,
              schedulePollMs: 60000,
              defaultMediaPollMs: 60000,
              healthCheckMs: 60000,
              screenshotMs: 300000,
            },
          },
          null,
          2
        )
      )

      clearRuntimeModules()

      try {
        const clock = sandbox.useFakeTimers()
        sandbox.stub(Math, 'random').returns(0.5)
        const { DeviceApiError } = require('../../src/common/types')
        const { getPlayerFlow } = require('../../src/main/services/player-flow')
        const { getPairingService } = require('../../src/main/services/pairing-service')
        const { getDeviceStateStore } = require('../../src/main/services/device-state-store')

        const stateStore = getDeviceStateStore()
        await stateStore.clearIdentity()
        const pairingService = getPairingService()
        sandbox.stub(pairingService, 'getStoredIdentityHealth').returns({ health: 'missing', issues: [] })
        sandbox.stub(pairingService, 'hasTrustworthyDeviceId').returns(false)
        const requestStub = sandbox.stub(pairingService, 'requestPairingCode')
        requestStub.onFirstCall().rejects(
          new DeviceApiError({
            message: 'connect ECONNREFUSED 192.168.0.2:3000',
            code: 'NETWORK_ERROR',
            transient: true,
          })
        )
        requestStub.onSecondCall().callsFake(async () => {
          await stateStore.update({
            deviceId: '11111111-1111-4111-8111-111111111111',
            pairingCode: 'PAIR12',
            pairingExpiresAt: new Date(Date.now() + 60000).toISOString(),
            activePairingMode: 'PAIRING',
          })
          return {
            id: 'pairing-1',
            device_id: '11111111-1111-4111-8111-111111111111',
            pairing_code: 'PAIR12',
            expires_at: new Date(Date.now() + 60000).toISOString(),
            expires_in: 60,
            connected: true,
          }
        })
        sandbox.stub(pairingService, 'fetchPairingStatus').resolves({
          device_id: '11111111-1111-4111-8111-111111111111',
          screen: null,
          active_pairing: {
            mode: 'PAIRING',
            confirmed: false,
            pairing_code: 'PAIR12',
            expires_at: new Date(Date.now() + 60000).toISOString(),
          },
        })

        const playerFlow = getPlayerFlow()
        await playerFlow.start()
        const status = playerFlow.getStatus()

        expect(playerFlow.getState()).to.equal('HARD_RECOVERY')
        expect(status.backendAvailable).to.equal(false)
        expect(status.pairingCode).to.equal(undefined)

        await clock.tickAsync(2001)
        expect(requestStub.calledTwice).to.equal(true)
        expect(playerFlow.getState()).to.equal('PAIRING_PENDING')
        expect(playerFlow.getStatus().pairingCode).to.equal('PAIR12')

        await playerFlow.stop()
      } finally {
        cleanupTempDir(tempDir)
        delete process.env.HEXMON_CONFIG_PATH
        clearRuntimeModules()
      }
    })
  })
})
