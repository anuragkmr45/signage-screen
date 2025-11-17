# API Documentation

## Overview

The HexmonSignage Player communicates with the backend API using HTTP/HTTPS and WebSocket protocols. All communication uses mutual TLS (mTLS) for authentication after device pairing.

## Base URL

```
Production: https://api.hexmon.com
Staging: https://api-staging.hexmon.com
```

## Authentication

### Device Pairing

**Endpoint:** `POST /v1/device-pairing/complete`

**Description:** Complete device pairing and receive client certificate

**Request:**
```json
{
  "pairing_code": "ABC123",
  "csr": "-----BEGIN CERTIFICATE REQUEST-----\n...",
  "device_info": {
    "hostname": "signage-001",
    "platform": "Linux",
    "arch": "x86_64",
    "app_version": "1.0.0"
  }
}
```

**Response:**
```json
{
  "device_id": "dev_abc123xyz",
  "certificate": "-----BEGIN CERTIFICATE-----\n...",
  "ca_certificate": "-----BEGIN CERTIFICATE-----\n...",
  "expires_at": "2025-04-05T00:00:00Z"
}
```

**Status Codes:**
- `200 OK` - Pairing successful
- `400 Bad Request` - Invalid pairing code or CSR
- `404 Not Found` - Pairing code not found
- `409 Conflict` - Device already paired

### mTLS Authentication

After pairing, all requests must include client certificate:

```bash
curl --cert /var/lib/hexmon/certs/client.crt \
     --key /var/lib/hexmon/certs/client.key \
     --cacert /var/lib/hexmon/certs/ca.crt \
     https://api.hexmon.com/v1/device/{device_id}/schedule
```

## Schedule Management

### Get Schedule

**Endpoint:** `GET /v1/device/{device_id}/schedule`

**Description:** Fetch current playback schedule

**Response:**
```json
{
  "id": "sched_abc123",
  "version": 42,
  "updated_at": "2025-01-05T12:00:00Z",
  "items": [
    {
      "id": "item_001",
      "type": "image",
      "objectKey": "media/image-001.jpg",
      "sha256": "abc123...",
      "displayMs": 10000,
      "fit": "contain",
      "transitionDurationMs": 500
    },
    {
      "id": "item_002",
      "type": "video",
      "objectKey": "media/video-001.mp4",
      "sha256": "def456...",
      "displayMs": 30000,
      "fit": "cover",
      "muted": true
    }
  ]
}
```

**Status Codes:**
- `200 OK` - Schedule retrieved
- `401 Unauthorized` - Invalid certificate
- `404 Not Found` - Device not found

### Check Emergency Override

**Endpoint:** `GET /v1/device/{device_id}/emergency`

**Description:** Check for emergency content override

**Response:**
```json
{
  "id": "emerg_001",
  "active": true,
  "priority": 100,
  "content": {
    "id": "emergency_slide",
    "type": "image",
    "url": "https://cdn.hexmon.com/emergency.png",
    "displayMs": 5000,
    "fit": "contain"
  },
  "expires_at": "2025-01-05T18:00:00Z"
}
```

**Status Codes:**
- `200 OK` - Emergency status retrieved
- `204 No Content` - No active emergency

## Telemetry

### Send Heartbeat

**Endpoint:** `POST /v1/device/heartbeat`

**Description:** Send device telemetry and health status

**Request:**
```json
{
  "device_id": "dev_abc123xyz",
  "timestamp": "2025-01-05T12:00:00Z",
  "system": {
    "cpu_percent": 35.2,
    "memory_used_bytes": 524288000,
    "memory_total_bytes": 8589934592,
    "disk_used_bytes": 10737418240,
    "disk_total_bytes": 107374182400,
    "temperature_celsius": 45.5,
    "uptime_seconds": 86400
  },
  "playback": {
    "current_schedule_id": "sched_abc123",
    "current_media_id": "item_001",
    "state": "playing"
  }
}
```

**Response:**
```json
{
  "received": true,
  "next_heartbeat_ms": 300000
}
```

**Status Codes:**
- `200 OK` - Heartbeat received
- `401 Unauthorized` - Invalid certificate

### Submit Proof-of-Play

**Endpoint:** `POST /v1/device/proof-of-play`

**Description:** Submit playback events for billing/analytics

**Request:**
```json
{
  "device_id": "dev_abc123xyz",
  "events": [
    {
      "schedule_id": "sched_abc123",
      "media_id": "item_001",
      "start_timestamp": "2025-01-05T12:00:00Z",
      "end_timestamp": "2025-01-05T12:00:10Z",
      "duration_ms": 10000,
      "completed": true
    }
  ]
}
```

**Response:**
```json
{
  "received": 1,
  "duplicates": 0
}
```

**Status Codes:**
- `200 OK` - Events received
- `400 Bad Request` - Invalid event format

## Commands

### Poll Commands

**Endpoint:** `GET /v1/device/{device_id}/commands`

**Description:** Poll for pending commands

**Response:**
```json
[
  {
    "id": "cmd_001",
    "type": "SCREENSHOT",
    "params": {},
    "created_at": "2025-01-05T12:00:00Z"
  },
  {
    "id": "cmd_002",
    "type": "REFRESH_SCHEDULE",
    "params": {},
    "created_at": "2025-01-05T12:01:00Z"
  }
]
```

**Command Types:**
- `REBOOT` - Restart application
- `REFRESH_SCHEDULE` - Force schedule refresh
- `SCREENSHOT` - Capture and upload screenshot
- `TEST_PATTERN` - Display test pattern
- `CLEAR_CACHE` - Clear media cache
- `PING` - Health check

**Status Codes:**
- `200 OK` - Commands retrieved
- `204 No Content` - No pending commands

### Acknowledge Command

**Endpoint:** `POST /v1/device/{device_id}/commands/{command_id}/ack`

**Description:** Acknowledge command execution

**Request:**
```json
{
  "success": true,
  "message": "Screenshot captured",
  "data": {
    "url": "https://cdn.hexmon.com/screenshots/..."
  },
  "timestamp": "2025-01-05T12:00:05Z"
}
```

**Response:**
```json
{
  "acknowledged": true
}
```

**Status Codes:**
- `200 OK` - Acknowledgment received
- `404 Not Found` - Command not found

## Media Management

### Get Presigned URL (Screenshot)

**Endpoint:** `POST /v1/device/{device_id}/screenshot/presigned-url`

**Description:** Get presigned URL for screenshot upload

**Request:**
```json
{
  "filename": "screenshot-2025-01-05.png",
  "content_type": "image/png"
}
```

**Response:**
```json
{
  "upload_url": "https://s3.amazonaws.com/...",
  "screenshot_url": "https://cdn.hexmon.com/screenshots/...",
  "expires_in": 3600
}
```

### Get Presigned URL (Logs)

**Endpoint:** `POST /v1/device/{device_id}/logs/presigned-url`

**Description:** Get presigned URL for log bundle upload

**Request:**
```json
{
  "filename": "logs-2025-01-05.json.gz",
  "content_type": "application/gzip"
}
```

**Response:**
```json
{
  "upload_url": "https://s3.amazonaws.com/...",
  "log_url": "https://cdn.hexmon.com/logs/...",
  "expires_in": 3600
}
```

## WebSocket

### Connection

**Endpoint:** `wss://api.hexmon.com/ws`

**Authentication:** mTLS certificate required

**Connection:**
```javascript
const ws = new WebSocket('wss://api.hexmon.com/ws', {
  cert: clientCert,
  key: clientKey,
  ca: caCert
})
```

### Messages

#### Schedule Update
```json
{
  "type": "schedule_update",
  "data": {
    "schedule_id": "sched_abc123",
    "version": 43
  }
}
```

#### Emergency Override
```json
{
  "type": "emergency",
  "data": {
    "id": "emerg_001",
    "active": true
  }
}
```

#### Command
```json
{
  "type": "command",
  "data": {
    "id": "cmd_003",
    "type": "SCREENSHOT",
    "params": {}
  }
}
```

#### Heartbeat (Ping/Pong)
```json
{
  "type": "ping"
}
```

**Response:**
```json
{
  "type": "pong"
}
```

## Error Responses

### Standard Error Format

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid pairing code format",
    "details": {
      "field": "pairing_code",
      "expected": "6 alphanumeric characters"
    }
  }
}
```

### Error Codes

- `INVALID_REQUEST` - Malformed request
- `UNAUTHORIZED` - Invalid or missing certificate
- `NOT_FOUND` - Resource not found
- `CONFLICT` - Resource conflict
- `RATE_LIMITED` - Too many requests
- `INTERNAL_ERROR` - Server error

## Rate Limits

- **Heartbeat:** 1 request per 5 minutes
- **Proof-of-Play:** 1 request per minute
- **Commands:** 1 poll per 30 seconds
- **Schedule:** 1 request per 5 minutes

**Rate Limit Headers:**
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1704470400
```

## Health Endpoint (Local)

**Endpoint:** `GET http://127.0.0.1:3300/healthz`

**Description:** Local health check endpoint

**Response:**
```json
{
  "status": "healthy",
  "uptime": 86400,
  "version": "1.0.0",
  "device_id": "dev_abc123xyz",
  "paired": true,
  "schedule": {
    "id": "sched_abc123",
    "version": 42,
    "last_sync": "2025-01-05T12:00:00Z"
  },
  "playback": {
    "state": "playing",
    "current_media": "item_001"
  },
  "cache": {
    "used_bytes": 10737418240,
    "total_bytes": 53687091200,
    "items": 42
  }
}
```

## Metrics Endpoint (Local)

**Endpoint:** `GET http://127.0.0.1:3300/metrics`

**Description:** Prometheus-compatible metrics

**Response:**
```
# HELP hexmon_uptime_seconds Application uptime in seconds
# TYPE hexmon_uptime_seconds gauge
hexmon_uptime_seconds 86400

# HELP hexmon_cpu_percent CPU usage percentage
# TYPE hexmon_cpu_percent gauge
hexmon_cpu_percent 35.2

# HELP hexmon_memory_bytes Memory usage in bytes
# TYPE hexmon_memory_bytes gauge
hexmon_memory_bytes 524288000
```

## SDK Examples

### Node.js
```javascript
const axios = require('axios')
const https = require('https')
const fs = require('fs')

const agent = new https.Agent({
  cert: fs.readFileSync('/var/lib/hexmon/certs/client.crt'),
  key: fs.readFileSync('/var/lib/hexmon/certs/client.key'),
  ca: fs.readFileSync('/var/lib/hexmon/certs/ca.crt')
})

const api = axios.create({
  baseURL: 'https://api.hexmon.com',
  httpsAgent: agent
})

// Get schedule
const schedule = await api.get('/v1/device/dev_abc123xyz/schedule')
```

### Python
```python
import requests

cert = ('/var/lib/hexmon/certs/client.crt', 
        '/var/lib/hexmon/certs/client.key')
ca = '/var/lib/hexmon/certs/ca.crt'

response = requests.get(
    'https://api.hexmon.com/v1/device/dev_abc123xyz/schedule',
    cert=cert,
    verify=ca
)
```

---

**Last Updated:** 2025-01-05
**API Version:** v1

