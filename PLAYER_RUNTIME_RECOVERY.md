# Player Runtime And Recovery Notes

## Boot policy
- If persisted `device_id`, private key, certificate, fingerprint, and CA certificate exist, the player boots into authenticated bootstrap.
- The player does not show pairing code on already-paired boot.
- Runtime is considered valid only after:
  1. authenticated snapshot succeeds
  2. authenticated heartbeat succeeds
- Legacy `/v1/device/:deviceId/schedule` and `/v1/device/:deviceId/emergency` polling is not the production contract and must not define runtime behavior.

## Recovery classification
- Transient infra failure -> `SOFT_RECOVERY`
- `403 Invalid device credentials` -> `RECOVERY_REQUIRED`
- `403 Device credentials expired` -> `RECOVERY_REQUIRED`
- `404 Device not registered` -> `HARD_RECOVERY`
- local identity corruption without a trustworthy `device_id` -> `HARD_RECOVERY`

## Cached playback policy
- If cached playable content exists, keep it visible during bootstrap and transient backend failures.
- Do not black-screen on temporary backend/network issues.
- Replace cached playback once a fresh authenticated snapshot is available.
- The device snapshot endpoint is the only authoritative runtime content contract.
- Snapshot payloads are evaluated locally against UTC `start_at` / `end_at` schedule windows.
- The player re-evaluates cached schedule windows at local time boundaries without requiring a fresh snapshot fetch.
- Slot-based presentations with `layout.spec.slots` are rendered as a local timed scene so each slot can keep cycling cached media until the schedule window ends.
- Resolved default media is cached locally for the paired device and is reused during `offline` and `empty` fallback modes when available.
- Default media rendering uses `contain` and reuses the same aspect-ratio-specific fallback across different resolutions of the same aspect ratio.

## Operator status surface
- Startup first shows the branded `HexmonSignage Player` landing state, then transitions without operator input.
- `PAIRING_PENDING` shows a 6-character connection code and expiry when the backend is reachable.
- Missing service configuration shows `Setup required` with administrator-facing guidance, not raw config keys.
- Transient backend/network failures during first pairing mark `backendAvailable=false` so the renderer can show `Service connection unavailable` and keep retrying automatically.
- If paired runtime or soft recovery has playable cached/default/scheduled content, keep playback visible and show only a discreet service notice.
- `qa` and `production` keep pairing/status display-only; manual refresh, retry, re-pair, and editable label controls are `dev`-only.

## Proof-of-play policy
- Proof-of-play is queued locally when offline.
- Replay queued events in order when connectivity returns.
- Screenshot upload is best-effort and must not block playback or proof-of-play replay.

## Recovery flow
- Prefer same-`device_id` recovery when backend exposes `active_pairing.mode === "RECOVERY"`.
- Use fresh pairing only when the old identity is not usable anymore.
