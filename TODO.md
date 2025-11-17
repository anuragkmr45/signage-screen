# HexmonSignage Player - TODO List

## Phase 1: Core Services (Priority: CRITICAL)

### Certificate Manager
- [ ] Create `src/main/services/cert-manager.ts`
- [ ] Implement ECDSA P-256 key pair generation
- [ ] Implement CSR generation with device info
- [ ] Implement certificate storage with 0600 permissions
- [ ] Implement certificate loading for mTLS
- [ ] Implement certificate expiry checking
- [ ] Implement auto-renewal logic
- [ ] Implement certificate chain verification
- [ ] Add unit tests for certificate operations
- [ ] Add integration tests for pairing flow

### Cache Manager
- [ ] Create `src/main/services/cache/cache-manager.ts`
- [ ] Create `src/main/services/cache/cache-index.ts` (SQLite)
- [ ] Create `src/main/services/cache/lru-eviction.ts`
- [ ] Create `src/main/services/cache/downloader.ts`
- [ ] Create `src/main/services/cache/integrity-checker.ts`
- [ ] Implement LRU eviction policy
- [ ] Implement atomic writes (temp → rename)
- [ ] Implement resume support with Range/ETag headers
- [ ] Implement SHA-256 integrity verification
- [ ] Implement quarantine for corrupted files
- [ ] Implement protection for "now-playing" content
- [ ] Implement full-disk handling
- [ ] Implement concurrent prefetch with bandwidth budget
- [ ] Add unit tests for cache operations
- [ ] Add integration tests for download and eviction
- [ ] Add fault injection tests for corrupted files

### Network Client
- [ ] Create `src/main/services/network/http-client.ts`
- [ ] Create `src/main/services/network/websocket-client.ts`
- [ ] Create `src/main/services/network/request-queue.ts`
- [ ] Create `src/main/services/network/backoff-strategy.ts`
- [ ] Implement Axios HTTP client with mTLS
- [ ] Implement WebSocket client with auto-reconnect
- [ ] Implement offline request queue with persistence
- [ ] Implement exponential backoff with jitter
- [ ] Implement HTTP fallback when WebSocket unavailable
- [ ] Add unit tests for network operations
- [ ] Add integration tests for mTLS
- [ ] Add fault injection tests for network loss

## Phase 2: Device Management (Priority: HIGH)

### Pairing Service
- [ ] Create `src/main/services/pairing-service.ts`
- [ ] Implement pairing screen display
- [ ] Implement pairing code submission
- [ ] Implement pairing completion and credential storage
- [ ] Implement network diagnostics
- [ ] Add IPC handlers for pairing
- [ ] Add unit tests for pairing logic
- [ ] Add integration tests for full pairing flow

### Telemetry Service
- [ ] Create `src/main/services/telemetry/telemetry-service.ts`
- [ ] Create `src/main/services/telemetry/system-stats.ts`
- [ ] Create `src/main/services/telemetry/heartbeat.ts`
- [ ] Create `src/main/services/telemetry/health-server.ts`
- [ ] Implement system stats collection (CPU, RAM, disk, network, temp)
- [ ] Implement heartbeat sender with backpressure
- [ ] Implement health HTTP server on 127.0.0.1:3300
- [ ] Implement /healthz endpoint
- [ ] Implement optional /metrics endpoint (Prometheus format)
- [ ] Add unit tests for telemetry
- [ ] Add integration tests for health endpoint

### Proof-of-Play Service
- [ ] Create `src/main/services/pop-service.ts`
- [ ] Implement playback start recording
- [ ] Implement playback end recording
- [ ] Implement offline spooling to disk
- [ ] Implement batch flushing with backpressure
- [ ] Implement deduplication by (deviceId, mediaId, start_ts)
- [ ] Add unit tests for PoP logic
- [ ] Add integration tests for offline spooling
- [ ] Add idempotency tests

## Phase 3: Content & Playback (Priority: HIGH)

### Schedule Manager
- [ ] Create `src/main/services/schedule-manager.ts`
- [ ] Implement schedule snapshot fetching
- [ ] Implement schedule validation
- [ ] Implement prefetching of next N items
- [ ] Implement emergency override checking
- [ ] Implement schedule update handling
- [ ] Add unit tests for schedule logic
- [ ] Add integration tests for prefetching

### Playback Engine
- [ ] Create `src/main/services/playback/playback-engine.ts`
- [ ] Create `src/main/services/playback/media-renderer.ts`
- [ ] Create `src/main/services/playback/transition-manager.ts`
- [ ] Create `src/main/services/playback/timeline-scheduler.ts`
- [ ] Implement timeline scheduling with jitter control
- [ ] Implement media type routing
- [ ] Implement GPU-accelerated transitions
- [ ] Implement fallback slide for errors
- [ ] Implement emergency override handling
- [ ] Add unit tests for playback logic
- [ ] Add integration tests for full playback flow
- [ ] Add performance tests for timeline jitter

### Media Renderers
- [ ] Create `src/renderer/image-renderer.ts`
- [ ] Create `src/renderer/video-renderer.ts`
- [ ] Create `src/renderer/pdf-renderer.ts`
- [ ] Create `src/renderer/url-renderer.ts`
- [ ] Implement image rendering with fit modes (contain, cover, stretch)
- [ ] Implement video playback with GPU decode
- [ ] Implement PDF rendering with pdf.js
- [ ] Implement locked-down webview for URLs
- [ ] Add unit tests for renderers
- [ ] Add integration tests for media playback

## Phase 4: Commands & Control (Priority: MEDIUM)

### Command Processor
- [ ] Create `src/main/services/command-processor.ts`
- [ ] Implement command polling
- [ ] Implement command processing (REBOOT, REFRESH_SCHEDULE, SCREENSHOT, TEST_PATTERN, CLEAR_CACHE, PING)
- [ ] Implement command acknowledgment
- [ ] Implement command coalescing
- [ ] Implement rate limiting
- [ ] Add unit tests for command processing
- [ ] Add integration tests for command flow

### Screenshot Service
- [ ] Create `src/main/services/screenshot-service.ts`
- [ ] Implement screen capture
- [ ] Implement PNG encoding
- [ ] Implement MinIO upload
- [ ] Implement presigned URL generation
- [ ] Add unit tests for screenshot logic
- [ ] Add integration tests for upload

## Phase 5: Power & Display (Priority: MEDIUM)

### Power Manager
- [ ] Create `src/main/services/power-manager.ts`
- [ ] Implement screen blanking prevention (xset s off)
- [ ] Implement DPMS control (xset -dpms)
- [ ] Implement display on/off scheduling
- [ ] Implement display detection (xrandr)
- [ ] Implement multi-display configuration
- [ ] Add unit tests for power management
- [ ] Add integration tests for DPMS control

## Phase 6: Logging & Monitoring (Priority: MEDIUM)

### Log Shipper
- [ ] Create `src/main/services/log-shipper.ts`
- [ ] Implement log bundling
- [ ] Implement compression (gzip)
- [ ] Implement MinIO upload
- [ ] Implement presigned URL generation
- [ ] Implement retry with jitter
- [ ] Add unit tests for log shipping
- [ ] Add integration tests for upload

## Phase 7: System Integration (Priority: HIGH)

### Systemd Service
- [ ] Create `scripts/hexmon-player.service`
- [ ] Configure service for autostart
- [ ] Configure restart policy
- [ ] Configure environment variables
- [ ] Test service installation
- [ ] Test service restart

### Installation Scripts
- [ ] Create `scripts/postinstall.sh`
- [ ] Create `scripts/postremove.sh`
- [ ] Create `scripts/pair-device.sh`
- [ ] Create `scripts/rotate-certs.sh`
- [ ] Create `scripts/clear-cache.sh`
- [ ] Create `scripts/collect-logs.sh`
- [ ] Test all scripts on Ubuntu 20.04
- [ ] Test all scripts on Ubuntu 22.04

## Phase 8: Testing (Priority: HIGH)

### Unit Tests
- [ ] Set up Mocha test framework
- [ ] Write tests for all services
- [ ] Achieve >80% code coverage
- [ ] Set up CI pipeline for tests

### Integration Tests
- [ ] Write tests for pairing flow
- [ ] Write tests for schedule → prefetch → playback → PoP → flush
- [ ] Write tests for command processing
- [ ] Write tests for emergency override

### Fault Injection Tests
- [ ] Test corrupted file handling
- [ ] Test network loss scenarios
- [ ] Test disk full scenarios
- [ ] Test WebSocket reconnection
- [ ] Test certificate expiry

### Performance Tests
- [ ] Test cold start time (target: ≤5s)
- [ ] Test CPU usage (target: <40% p95)
- [ ] Test RAM usage (target: <500MB p95)
- [ ] Test timeline jitter (target: ≤100ms p95)
- [ ] Profile and optimize bottlenecks

## Phase 9: Documentation (Priority: MEDIUM)

### Security Documentation
- [ ] Create `SECURITY.md`
- [ ] Document security considerations
- [ ] Document vulnerability reporting process
- [ ] Document security best practices

### Troubleshooting Guide
- [ ] Create `TROUBLESHOOTING.md`
- [ ] Document common issues and solutions
- [ ] Document log locations
- [ ] Document diagnostic procedures

### API Documentation
- [ ] Create `API.md`
- [ ] Document all backend endpoints
- [ ] Document WebSocket messages
- [ ] Document IPC messages

### Deployment Guide
- [ ] Create `DEPLOYMENT.md`
- [ ] Document installation procedures
- [ ] Document configuration options
- [ ] Document systemd service setup

### Contributing Guide
- [ ] Create `CONTRIBUTING.md`
- [ ] Document development setup
- [ ] Document coding standards
- [ ] Document PR process

## Additional Tasks

### Renderer UI
- [ ] Create `src/renderer/player.ts`
- [ ] Create `src/renderer/pairing.ts`
- [ ] Create `src/renderer/diagnostics.ts`
- [ ] Create `src/renderer/styles.css`
- [ ] Implement playback UI controller
- [ ] Implement pairing screen logic
- [ ] Implement diagnostics overlay (Ctrl+Shift+D)
- [ ] Add CSS animations and transitions

### IPC Handlers
- [ ] Add IPC handlers in main process
- [ ] Implement playback-update handler
- [ ] Implement media-change handler
- [ ] Implement emergency-override handler
- [ ] Implement submit-pairing handler
- [ ] Implement get-diagnostics handler
- [ ] Implement get-health handler
- [ ] Implement execute-command handler

### CI/CD
- [ ] Set up GitHub Actions workflow
- [ ] Configure automated testing
- [ ] Configure automated building
- [ ] Configure automated packaging
- [ ] Configure release automation

## Stretch Goals (Optional)

- [ ] Implement update system with signed packages
- [ ] Implement rollback mechanism
- [ ] Add support for multi-display configurations
- [ ] Add support for touch screen input
- [ ] Add support for custom transitions
- [ ] Add support for live streaming
- [ ] Add support for interactive content
- [ ] Implement A/B testing for content
- [ ] Add analytics dashboard
- [ ] Add remote debugging capabilities

## Notes

- Prioritize security and stability over features
- Test thoroughly before moving to next phase
- Document as you go
- Follow the implementation guide
- Use the existing utilities and patterns
- Keep performance targets in mind
- Handle all edge cases

---

**Last Updated**: 2025-01-05
**Status**: Foundation Complete, Ready for Phase 1

