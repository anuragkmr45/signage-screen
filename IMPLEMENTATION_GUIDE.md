# HexmonSignage Player - Implementation Guide

This document provides a comprehensive guide to complete the implementation of the HexmonSignage Player.

## Project Status

### ✅ Completed
1. **Project Setup & Architecture**
   - TypeScript configuration with strict mode
   - ESLint and Prettier setup
   - Build scripts and package.json
   - electron-builder configuration
   - Directory structure

2. **Common Infrastructure**
   - Type definitions (`src/common/types.ts`)
   - Configuration management (`src/common/config.ts`)
   - Structured logging with Pino (`src/common/logger.ts`)
   - Utility functions (`src/common/utils.ts`)
   - Main process entry point (`src/main/index.ts`)

### 🚧 In Progress / To Be Implemented

The following components need to be implemented. Each section includes the file structure and key implementation details.

## Implementation Roadmap

### Phase 1: Core Services (Week 1-2)

#### 1. Certificate Manager (`src/main/services/cert-manager.ts`)
```typescript
export class CertificateManager {
  // Generate ECDSA P-256 key pair and CSR
  async generateCSR(deviceInfo: DeviceInfo): Promise<string>
  
  // Store certificate with 0600 permissions
  async storeCertificate(cert: string, key: string, ca: string): Promise<void>
  
  // Load certificates for mTLS
  async loadCertificates(): Promise<{ cert: Buffer; key: Buffer; ca: Buffer }>
  
  // Check certificate expiry and auto-renew
  async checkAndRenew(): Promise<void>
  
  // Verify certificate chain
  async verifyCertificate(): Promise<boolean>
}
```

#### 2. Cache Manager (`src/main/services/cache/`)
Files needed:
- `cache-manager.ts` - Main cache orchestrator
- `cache-index.ts` - SQLite index for cache entries
- `lru-eviction.ts` - LRU eviction policy
- `downloader.ts` - Concurrent download with resume support
- `integrity-checker.ts` - SHA-256 verification

Key features:
- LRU eviction with maxBytes limit
- Atomic writes (temp → rename)
- Resume support with Range/ETag headers
- SHA-256 integrity verification
- Quarantine for corrupted files
- Protection for "now-playing" content
- Full-disk handling

#### 3. Network Client (`src/main/services/network/`)
Files needed:
- `http-client.ts` - Axios-based HTTP client with mTLS
- `websocket-client.ts` - WebSocket with auto-reconnect
- `request-queue.ts` - Offline request queue
- `backoff-strategy.ts` - Exponential backoff

Key features:
- mTLS support
- Automatic retry with backoff
- Offline queue with persistence
- WebSocket auto-reconnect with jitter
- HTTP fallback when WebSocket unavailable

### Phase 2: Device Management (Week 2-3)

#### 4. Pairing Service (`src/main/services/pairing-service.ts`)
```typescript
export class PairingService {
  // Display pairing screen
  async showPairingScreen(): Promise<void>
  
  // Submit pairing request
  async submitPairing(code: string): Promise<PairingResponse>
  
  // Complete pairing and store credentials
  async completePairing(response: PairingResponse): Promise<void>
  
  // Network diagnostics
  async runDiagnostics(): Promise<DiagnosticsResult>
}
```

#### 5. Telemetry Service (`src/main/services/telemetry/`)
Files needed:
- `telemetry-service.ts` - Main telemetry orchestrator
- `system-stats.ts` - CPU, RAM, disk, network, temperature
- `heartbeat.ts` - Periodic heartbeat sender
- `health-server.ts` - HTTP server for /healthz endpoint

Key features:
- System stats collection
- Heartbeat with backpressure
- Health endpoint on 127.0.0.1:3300
- Optional Prometheus /metrics endpoint

#### 6. Proof-of-Play Service (`src/main/services/pop-service.ts`)
```typescript
export class ProofOfPlayService {
  // Record playback start
  recordStart(scheduleId: string, mediaId: string): void
  
  // Record playback end
  recordEnd(scheduleId: string, mediaId: string, completed: boolean): void
  
  // Spool events to disk when offline
  async spoolEvent(event: ProofOfPlayEvent): Promise<void>
  
  // Batch flush with backpressure
  async flushEvents(): Promise<void>
  
  // Deduplicate by (deviceId, mediaId, start_ts)
  async deduplicateEvents(): Promise<void>
}
```

### Phase 3: Content & Playback (Week 3-4)

#### 7. Schedule Manager (`src/main/services/schedule-manager.ts`)
```typescript
export class ScheduleManager {
  // Fetch schedule snapshot
  async fetchSchedule(): Promise<ScheduleSnapshot>
  
  // Validate schedule
  validateSchedule(schedule: ScheduleSnapshot): boolean
  
  // Prefetch next N items
  async prefetchItems(items: TimelineItem[], count: number): Promise<void>
  
  // Check emergency override
  async checkEmergency(): Promise<EmergencyOverride | null>
  
  // Handle schedule updates
  onScheduleUpdate(callback: (schedule: ScheduleSnapshot) => void): void
}
```

#### 8. Playback Engine (`src/main/services/playback/`)
Files needed:
- `playback-engine.ts` - Main playback orchestrator
- `media-renderer.ts` - Render different media types
- `transition-manager.ts` - GPU-accelerated transitions
- `timeline-scheduler.ts` - Precise timing with jitter control

Key features:
- Support for images, video, PDF, URLs
- GPU-accelerated fade transitions
- Timeline jitter ≤100ms p95
- Fallback slide for errors
- Emergency override handling

#### 9. Media Renderers (`src/renderer/`)
Files needed:
- `image-renderer.ts` - Image display with fit modes
- `video-renderer.ts` - Video playback with GPU decode
- `pdf-renderer.ts` - PDF rendering with pdf.js
- `url-renderer.ts` - Locked-down webview for URLs

### Phase 4: Commands & Control (Week 4-5)

#### 10. Command Processor (`src/main/services/command-processor.ts`)
```typescript
export class CommandProcessor {
  // Poll for commands
  async pollCommands(): Promise<DeviceCommand[]>
  
  // Process command
  async processCommand(command: DeviceCommand): Promise<CommandAcknowledgment>
  
  // Acknowledge command
  async acknowledgeCommand(ack: CommandAcknowledgment): Promise<void>
  
  // Coalesce similar commands
  coalesceCommands(commands: DeviceCommand[]): DeviceCommand[]
  
  // Rate limiting
  isRateLimited(commandType: CommandType): boolean
}
```

Supported commands:
- REBOOT - Restart the application
- REFRESH_SCHEDULE - Force schedule refresh
- SCREENSHOT - Capture and upload screenshot
- TEST_PATTERN - Display test pattern
- CLEAR_CACHE - Clear non-critical cache
- PING - Health check

#### 11. Screenshot Service (`src/main/services/screenshot-service.ts`)
```typescript
export class ScreenshotService {
  // Capture current frame
  async captureScreen(): Promise<Buffer>
  
  // Encode as PNG
  async encodePNG(buffer: Buffer): Promise<Buffer>
  
  // Upload to MinIO
  async uploadScreenshot(png: Buffer): Promise<string>
  
  // Generate presigned URL
  async getPresignedUrl(objectKey: string): Promise<string>
}
```

### Phase 5: Power & Display (Week 5)

#### 12. Power Manager (`src/main/services/power-manager.ts`)
```typescript
export class PowerManager {
  // Prevent screen blanking
  async preventBlanking(): Promise<void>
  
  // Control DPMS
  async setDPMS(enabled: boolean): Promise<void>
  
  // Schedule on/off times
  async scheduleDisplay(onTime: string, offTime: string): Promise<void>
  
  // Detect displays
  async getDisplays(): Promise<DisplayInfo[]>
  
  // Handle multi-display
  async configureDisplays(mode: 'clone' | 'extend'): Promise<void>
}
```

Commands used:
- `xset s off` - Disable screen saver
- `xset -dpms` - Disable DPMS
- `xset dpms force off` - Turn off display
- `xrandr` - Display detection and configuration

### Phase 6: Logging & Monitoring (Week 5-6)

#### 13. Log Shipper (`src/main/services/log-shipper.ts`)
```typescript
export class LogShipper {
  // Bundle logs
  async bundleLogs(): Promise<Buffer>
  
  // Compress bundle
  async compressBundle(bundle: Buffer): Promise<Buffer>
  
  // Upload to MinIO
  async uploadLogs(compressed: Buffer): Promise<void>
  
  // Get presigned URL for upload
  async getUploadUrl(): Promise<string>
  
  // Retry with jitter
  async uploadWithRetry(data: Buffer, maxRetries: number): Promise<void>
}
```

Upload path: `system_logs/device-<id>/YYYY/MM/DD/HH-MM-SS.log.gz`

### Phase 7: UI & Renderer (Week 6)

#### 14. Renderer Process (`src/renderer/`)
Files needed:
- `index.html` - Main HTML structure
- `player.ts` - Playback UI controller
- `pairing.ts` - Pairing screen
- `diagnostics.ts` - Diagnostics overlay (Ctrl+Shift+D)
- `styles.css` - Styling

Key features:
- Fullscreen playback canvas
- Pairing code entry
- Network diagnostics display
- Diagnostics overlay with real-time stats

#### 15. Preload Script (`src/preload/index.ts`)
```typescript
// Expose safe IPC methods to renderer
contextBridge.exposeInMainWorld('hexmon', {
  // Playback control
  onPlaybackUpdate: (callback) => ipcRenderer.on('playback-update', callback),
  
  // Pairing
  submitPairingCode: (code) => ipcRenderer.invoke('submit-pairing', code),
  
  // Diagnostics
  getDiagnostics: () => ipcRenderer.invoke('get-diagnostics'),
  
  // Health
  getHealth: () => ipcRenderer.invoke('get-health'),
})
```

### Phase 8: System Integration (Week 7)

#### 16. Systemd Service (`scripts/hexmon-player.service`)
```ini
[Unit]
Description=HexmonSignage Player
After=network-online.target graphical.target
Wants=network-online.target

[Service]
Type=simple
User=hexmon
Group=hexmon
Environment="DISPLAY=:0"
Environment="XAUTHORITY=/home/hexmon/.Xauthority"
ExecStart=/usr/bin/hexmon-signage-player
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=graphical.target
```

#### 17. Installation Scripts
Files needed:
- `scripts/postinstall.sh` - Post-installation setup
- `scripts/postremove.sh` - Cleanup on uninstall
- `scripts/pair-device.sh` - Device pairing helper
- `scripts/rotate-certs.sh` - Certificate rotation
- `scripts/clear-cache.sh` - Cache management
- `scripts/collect-logs.sh` - Log collection

### Phase 9: Testing (Week 7-8)

#### 18. Test Suite (`test/`)
Files needed:
- `unit/` - Unit tests for services
- `integration/` - Integration tests
- `fault-injection/` - Fault injection tests
- `performance/` - Performance tests

Key test scenarios:
- Cache integrity with corrupted files
- Network loss and recovery
- Disk full handling
- WebSocket reconnection
- Command idempotency
- PoP deduplication
- Schedule prefetching
- Emergency override priority

### Phase 10: Documentation (Week 8)

#### 19. Documentation Files
- `SECURITY.md` - Security considerations
- `TROUBLESHOOTING.md` - Common issues and solutions
- `API.md` - API documentation
- `DEPLOYMENT.md` - Deployment guide
- `CONTRIBUTING.md` - Contribution guidelines

## Build & Package

```bash
# Install dependencies
npm install

# Build
npm run build

# Package for Ubuntu
npm run package:deb
npm run package:appimage

# Output
build/hexmon-signage-player_1.0.0_amd64.deb
build/hexmon-signage-player_1.0.0_x86_64.AppImage
```

## Testing Strategy

1. **Unit Tests**: Test individual services in isolation
2. **Integration Tests**: Test service interactions
3. **Fault Injection**: Test error handling and recovery
4. **Performance Tests**: Verify performance targets
5. **Security Tests**: Verify CSP, sandboxing, mTLS
6. **End-to-End Tests**: Full workflow testing

## Deployment

1. Build .deb package
2. Install on Ubuntu device
3. Configure `/etc/hexmon/config.json`
4. Run pairing process
5. Enable systemd service
6. Monitor via health endpoint

## Monitoring

- Health endpoint: `http://127.0.0.1:3300/healthz`
- Logs: `/var/cache/hexmon/logs/`
- Metrics: `http://127.0.0.1:3300/metrics` (optional)
- Diagnostics: Ctrl+Shift+D in player

## Next Steps

1. Implement Phase 1 (Core Services)
2. Test certificate generation and mTLS
3. Implement Phase 2 (Device Management)
4. Test pairing flow
5. Continue through remaining phases
6. Comprehensive testing
7. Documentation
8. Production deployment

## Resources

- Electron Security: https://electronjs.org/docs/latest/tutorial/security
- MinIO JavaScript SDK: https://github.com/minio/minio-js
- Pino Logging: https://github.com/pinojs/pino
- Better SQLite3: https://github.com/WiseLibs/better-sqlite3
- DPMS Control: https://wiki.archlinux.org/title/Display_Power_Management_Signaling

