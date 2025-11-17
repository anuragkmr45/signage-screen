/**
 * Integration test for device pairing flow
 * Tests: CSR generation → certificate storage → mTLS activation
 */

import { expect } from 'chai'
import * as sinon from 'sinon'
import * as fs from 'fs'
import * as path from 'path'
import { createTempDir, cleanupTempDir, createMockCertificate } from '../helpers/test-utils'

describe('Pairing Flow Integration', () => {
  let tempDir: string
  let certDir: string
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    tempDir = createTempDir('pairing-test-')
    certDir = path.join(tempDir, 'certs')
    fs.mkdirSync(certDir, { recursive: true })

    // Mock config
    process.env.HEXMON_CONFIG_PATH = path.join(tempDir, 'config.json')
    const testConfig = {
      apiBase: 'https://api-test.hexmon.com',
      wsUrl: 'wss://api-test.hexmon.com/ws',
      mTLS: {
        enabled: true,
        certPath: certDir,
      },
      cache: {
        path: path.join(tempDir, 'cache'),
        maxBytes: 1073741824,
      },
      intervals: {
        heartbeatMs: 300000,
        schedulePollMs: 300000,
      },
    }
    fs.writeFileSync(process.env.HEXMON_CONFIG_PATH, JSON.stringify(testConfig, null, 2))
  })

  afterEach(() => {
    sandbox.restore()
    cleanupTempDir(tempDir)
    delete process.env.HEXMON_CONFIG_PATH

    // Clear module cache
    Object.keys(require.cache).forEach((key) => {
      if (key.includes('src/main/services') || key.includes('src/common')) {
        delete require.cache[key]
      }
    })
  })

  describe('Complete Pairing Flow', () => {
    it('should complete pairing flow successfully', async () => {
      const { getCertificateManager } = require('../../src/main/services/cert-manager')
      const { getPairingService } = require('../../src/main/services/pairing-service')
      const { getHttpClient } = require('../../src/main/services/network/http-client')

      const certManager = getCertificateManager()
      const pairingService = getPairingService()
      const httpClient = getHttpClient()

      // Step 1: Generate CSR
      const csr = await certManager.generateCSR({
        commonName: 'test-device',
        organization: 'HexmonSignage',
        country: 'US',
      })

      expect(csr).to.include('BEGIN CERTIFICATE REQUEST')

      // Step 2: Mock pairing API response
      const mockCert = createMockCertificate()
      sandbox.stub(httpClient, 'post').resolves({
        device_id: 'test-device-123',
        certificate: mockCert.cert,
        ca_certificate: mockCert.cert,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      })

      // Step 3: Submit pairing
      const result = await pairingService.submitPairing('ABC123')

      expect(result.success).to.be.true
      expect(result.deviceId).to.equal('test-device-123')

      // Step 4: Verify certificates are stored
      const clientCertPath = path.join(certDir, 'client.crt')
      const caCertPath = path.join(certDir, 'ca.crt')

      expect(fs.existsSync(clientCertPath)).to.be.true
      expect(fs.existsSync(caCertPath)).to.be.true

      // Step 5: Verify device is paired
      expect(pairingService.isPairedDevice()).to.be.true
      expect(pairingService.getDeviceId()).to.equal('test-device-123')
    })

    it('should handle pairing failure gracefully', async () => {
      const { getPairingService } = require('../../src/main/services/pairing-service')
      const { getHttpClient } = require('../../src/main/services/network/http-client')

      const pairingService = getPairingService()
      const httpClient = getHttpClient()

      // Mock API error
      sandbox.stub(httpClient, 'post').rejects(new Error('Invalid pairing code'))

      const result = await pairingService.submitPairing('INVALID')

      expect(result.success).to.be.false
      expect(result.error).to.include('Invalid pairing code')
      expect(pairingService.isPairedDevice()).to.be.false
    })

    it('should activate mTLS after pairing', async () => {
      const { getPairingService } = require('../../src/main/services/pairing-service')
      const { getHttpClient } = require('../../src/main/services/network/http-client')

      const pairingService = getPairingService()
      const httpClient = getHttpClient()

      // Mock successful pairing
      const mockCert = createMockCertificate()
      sandbox.stub(httpClient, 'post').resolves({
        device_id: 'test-device-123',
        certificate: mockCert.cert,
        ca_certificate: mockCert.cert,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      })

      await pairingService.submitPairing('ABC123')

      // Verify mTLS is configured
      const axiosInstance = httpClient.getAxiosInstance()
      expect(axiosInstance.defaults.httpsAgent).to.exist
    })
  })

  describe('Certificate Management', () => {
    it('should detect certificate expiry', async () => {
      const { getCertificateManager } = require('../../src/main/services/cert-manager')
      const certManager = getCertificateManager()

      // Create expired certificate
      const mockCert = createMockCertificate()
      fs.writeFileSync(path.join(certDir, 'client.crt'), mockCert.cert)

      // Mock certificate parsing to return expired date
      sandbox.stub(certManager, 'getCertificateExpiry' as any).returns(new Date(Date.now() - 1000))

      const needsRenewal = await certManager.needsRenewal()
      expect(needsRenewal).to.be.true
    })

    it('should delete certificates on unpair', async () => {
      const { getPairingService } = require('../../src/main/services/pairing-service')
      const pairingService = getPairingService()

      // Create mock certificates
      const mockCert = createMockCertificate()
      fs.writeFileSync(path.join(certDir, 'client.key'), mockCert.key)
      fs.writeFileSync(path.join(certDir, 'client.crt'), mockCert.cert)
      fs.writeFileSync(path.join(certDir, 'ca.crt'), mockCert.cert)

      await pairingService.unpair()

      expect(fs.existsSync(path.join(certDir, 'client.key'))).to.be.false
      expect(fs.existsSync(path.join(certDir, 'client.crt'))).to.be.false
      expect(fs.existsSync(path.join(certDir, 'ca.crt'))).to.be.false
    })
  })

  describe('Network Diagnostics', () => {
    it('should run network diagnostics', async () => {
      const { getPairingService } = require('../../src/main/services/pairing-service')
      const pairingService = getPairingService()

      const diagnostics = await pairingService.runDiagnostics()

      expect(diagnostics).to.have.property('ipAddresses')
      expect(diagnostics).to.have.property('dnsResolution')
      expect(diagnostics).to.have.property('apiConnectivity')
      expect(diagnostics).to.have.property('wsConnectivity')
    })
  })
})

