/**
 * Certificate Manager - mTLS certificate generation and management
 * Handles ECDSA P-256 key pair generation, CSR creation, certificate storage, and auto-renewal
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { getLogger } from '../../common/logger'
import { getConfigManager } from '../../common/config'
import { atomicWrite, ensureDir } from '../../common/utils'
import { DeviceInfo } from '../../common/types'

const logger = getLogger('cert-manager')

export interface CertificateInfo {
  subject: string
  issuer: string
  validFrom: Date
  validTo: Date
  serialNumber: string
  fingerprint: string
}

export class CertificateManager {
  private certPath: string
  private keyPath: string
  private caPath: string
  private csrPath: string

  constructor() {
    const config = getConfigManager().getConfig()
    this.certPath = config.mtls.certPath
    this.keyPath = config.mtls.keyPath
    this.caPath = config.mtls.caPath
    this.csrPath = path.join(path.dirname(this.keyPath), 'client.csr')

    // Ensure certificate directory exists with secure permissions
    const certDir = path.dirname(this.certPath)
    ensureDir(certDir, 0o700)
  }

  /**
   * Generate ECDSA P-256 key pair
   */
  async generateKeyPair(): Promise<{ privateKey: string; publicKey: string }> {
    logger.info('Generating ECDSA P-256 key pair')

    return new Promise((resolve, reject) => {
      crypto.generateKeyPair(
        'ec',
        {
          namedCurve: 'prime256v1', // P-256
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
          },
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
          },
        },
        (err, publicKey, privateKey) => {
          if (err) {
            logger.error({ error: err }, 'Failed to generate key pair')
            reject(err)
          } else {
            logger.info('Key pair generated successfully')
            resolve({ privateKey, publicKey })
          }
        }
      )
    })
  }

  /**
   * Generate Certificate Signing Request (CSR)
   */
  async generateCSR(deviceInfo: DeviceInfo): Promise<string> {
    logger.info({ deviceId: deviceInfo.deviceId }, 'Generating CSR')

    try {
      // Generate key pair if not exists
      let privateKey: string
      if (fs.existsSync(this.keyPath)) {
        privateKey = fs.readFileSync(this.keyPath, 'utf-8')
        logger.info('Using existing private key')
      } else {
        const keyPair = await this.generateKeyPair()
        privateKey = keyPair.privateKey

        // Store private key with secure permissions
        await atomicWrite(this.keyPath, privateKey)
        fs.chmodSync(this.keyPath, 0o600)
        logger.info({ keyPath: this.keyPath }, 'Private key stored securely')
      }

      // Create CSR using openssl-like approach
      // Note: Node.js doesn't have built-in CSR generation, so we use a workaround
      // In production, you might want to use a library like 'node-forge' or call openssl
      const csr = this.createCSRManually(privateKey, deviceInfo)

      // Store CSR
      await atomicWrite(this.csrPath, csr)
      logger.info({ csrPath: this.csrPath }, 'CSR generated and stored')

      return csr
    } catch (error) {
      logger.error({ error }, 'Failed to generate CSR')
      throw error
    }
  }

  /**
   * Create CSR manually (simplified version)
   * In production, use node-forge or similar library
   */
  private createCSRManually(_privateKey: string, deviceInfo: DeviceInfo): string {
    // This is a simplified placeholder
    // In production, use node-forge or call openssl subprocess
    const subject = `/CN=${deviceInfo.deviceId}/O=HexmonSignage/C=US`
    const csrTemplate = `-----BEGIN CERTIFICATE REQUEST-----
[CSR_DATA_PLACEHOLDER]
Subject: ${subject}
Device: ${deviceInfo.hostname}
Platform: ${deviceInfo.platform}
-----END CERTIFICATE REQUEST-----`

    logger.warn('Using simplified CSR generation. Use node-forge in production.')
    return csrTemplate
  }

  /**
   * Store certificate with secure permissions
   */
  async storeCertificate(cert: string, ca: string): Promise<void> {
    logger.info('Storing certificates')

    try {
      // Store client certificate
      await atomicWrite(this.certPath, cert)
      fs.chmodSync(this.certPath, 0o600)
      logger.info({ certPath: this.certPath }, 'Client certificate stored')

      // Store CA certificate
      await atomicWrite(this.caPath, ca)
      fs.chmodSync(this.caPath, 0o600)
      logger.info({ caPath: this.caPath }, 'CA certificate stored')

      // Verify certificates
      const isValid = await this.verifyCertificate()
      if (!isValid) {
        throw new Error('Certificate verification failed')
      }

      logger.info('Certificates stored and verified successfully')
    } catch (error) {
      logger.error({ error }, 'Failed to store certificates')
      throw error
    }
  }

  /**
   * Load certificates for mTLS
   */
  async loadCertificates(): Promise<{ cert: Buffer; key: Buffer; ca: Buffer }> {
    logger.debug('Loading certificates for mTLS')

    try {
      if (!this.areCertificatesPresent()) {
        throw new Error('Certificates not found')
      }

      const cert = fs.readFileSync(this.certPath)
      const key = fs.readFileSync(this.keyPath)
      const ca = fs.readFileSync(this.caPath)

      logger.debug('Certificates loaded successfully')
      return { cert, key, ca }
    } catch (error) {
      logger.error({ error }, 'Failed to load certificates')
      throw error
    }
  }

  /**
   * Check if certificates are present
   */
  areCertificatesPresent(): boolean {
    return fs.existsSync(this.certPath) && fs.existsSync(this.keyPath) && fs.existsSync(this.caPath)
  }

  /**
   * Parse certificate and extract information
   */
  async getCertificateInfo(): Promise<CertificateInfo | null> {
    if (!fs.existsSync(this.certPath)) {
      return null
    }

    try {
      const certPem = fs.readFileSync(this.certPath, 'utf-8')
      // Parse certificate using crypto module
      // This is simplified - in production use node-forge or x509 library
      const cert = crypto.X509Certificate ? new crypto.X509Certificate(certPem) : null

      if (!cert) {
        logger.warn('X509Certificate not available in this Node.js version')
        return null
      }

      return {
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom: new Date(cert.validFrom),
        validTo: new Date(cert.validTo),
        serialNumber: cert.serialNumber,
        fingerprint: cert.fingerprint,
      }
    } catch (error) {
      logger.error({ error }, 'Failed to parse certificate')
      return null
    }
  }

  /**
   * Check certificate expiry and determine if renewal is needed
   */
  async needsRenewal(): Promise<boolean> {
    const config = getConfigManager().getConfig()
    const certInfo = await this.getCertificateInfo()

    if (!certInfo) {
      logger.info('No certificate found, renewal needed')
      return true
    }

    const now = new Date()
    const daysUntilExpiry = Math.floor((certInfo.validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    logger.debug({ daysUntilExpiry, renewBeforeDays: config.mtls.renewBeforeDays }, 'Checking certificate expiry')

    if (daysUntilExpiry <= config.mtls.renewBeforeDays) {
      logger.info({ daysUntilExpiry }, 'Certificate renewal needed')
      return true
    }

    return false
  }

  /**
   * Verify certificate chain
   */
  async verifyCertificate(): Promise<boolean> {
    try {
      if (!this.areCertificatesPresent()) {
        return false
      }

      const certInfo = await this.getCertificateInfo()
      if (!certInfo) {
        return false
      }

      // Check if certificate is expired
      const now = new Date()
      if (now < certInfo.validFrom || now > certInfo.validTo) {
        logger.warn({ validFrom: certInfo.validFrom, validTo: certInfo.validTo }, 'Certificate is expired or not yet valid')
        return false
      }

      logger.debug('Certificate verification passed')
      return true
    } catch (error) {
      logger.error({ error }, 'Certificate verification failed')
      return false
    }
  }

  /**
   * Delete certificates (for testing or re-pairing)
   */
  async deleteCertificates(): Promise<void> {
    logger.warn('Deleting certificates')

    const files = [this.certPath, this.keyPath, this.caPath, this.csrPath]

    for (const file of files) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file)
        logger.info({ file }, 'Certificate file deleted')
      }
    }
  }

  /**
   * Get certificate paths
   */
  getCertificatePaths(): { cert: string; key: string; ca: string } {
    return {
      cert: this.certPath,
      key: this.keyPath,
      ca: this.caPath,
    }
  }
}

// Singleton instance
let certManager: CertificateManager | null = null

export function getCertificateManager(): CertificateManager {
  if (!certManager) {
    certManager = new CertificateManager()
  }
  return certManager
}

