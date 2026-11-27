# REST API Reference

All API routes are served by `server.ts` on port `3000` under `/api/*`. Every response includes defensive HTTP headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`) and never exposes stack traces.

---

## 1. Health & AI Status

### `GET /api/health`
Returns server liveness and whether Gemini credentials are configured.

```bash
curl http://localhost:3000/api/health
```

**Response (`200 OK`):**
```json
{
  "status": "ok",
  "service": "infravoice-shipsafe",
  "aiConfigured": true
}
```

### `GET /api/ai/status`
Returns read-only Gemini provider configuration (never returns secrets).

```bash
curl http://localhost:3000/api/ai/status
```

**Response (`200 OK`):**
```json
{
  "configured": true,
  "provider": "gemini-developer-api",
  "model": "gemini-4-hydrogen"
}
```

---

## 2. ShipSafe Deterministic Scanner

### `POST /api/shipsafe/scan`
- **Content-Type:** `multipart/form-data` (field name: `files`)
- **Limits:** Max `20` files, `1 MB` per file, `5 MB` total payload
- **Rate Limit:** `40 requests / 60s` per client IP

```bash
curl -X POST http://localhost:3000/api/shipsafe/scan \
  -F "files=@Dockerfile" \
  -F "files=@k8s-deployment.yaml"
```

**Response (`200 OK`):**
```json
{
  "scanId": "scan-9259e9f0",
  "scannedAt": "2026-11-27T07:24:10.000Z",
  "riskScore": 86,
  "riskLabel": "Critical",
  "totalFindings": 12,
  "severityCounts": { "critical": 3, "high": 3, "medium": 2, "low": 3, "info": 1 },
  "fileSummaries": [
    { "fileName": "Dockerfile", "fileType": "dockerfile", "lineCount": 7, "findingCount": 3 }
  ],
  "findings": [
    {
      "id": "...",
      "ruleId": "KS001",
      "title": "Privileged container enabled",
      "severity": "critical",
      "fileName": "k8s-deployment.yaml",
      "lineNumber": 14,
      "evidence": "privileged: true",
      "impact": "...",
      "recommendation": "..."
    }
  ]
}
```

**Error Codes:**
- `400` — Unsupported file type, empty file, binary NUL content, malformed YAML, or invalid filename
- `413` — File > 1 MB or total payload > 5 MB
- `429` — Rate limit exceeded (`Retry-After` header included)

---

## 3. Gemini Intelligence Endpoints

All AI routes accept `application/json` (max `512 KB`), enforce sliding-window rate limits (`AI_RATE_LIMIT_MAX_REQUESTS`, default `20 / 60s`), and return structured errors (`400`, `429`, `502`, `503`, `504`) without fabricating success.

### `POST /api/shipsafe/analyze`
Generates a structured Gemini executive summary, release recommendation, and prioritized remediation plan for a completed ShipSafe scan.

**Request Body:**
```json
{
  "scanResult": { "...output from POST /api/shipsafe/scan..." }
}
```

### `POST /api/infravoice/chat`
Multi-turn InfraVoice chat supporting attached ShipSafe scans, incident evidence, raw config/log snippets, multilingual responses, and allowlisted read-only tool calls.

**Request Body:**
```json
{
  "message": "Which two findings block production release first?",
  "conversationId": "conv-1732692000",
  "contextType": "shipsafe",
  "language": "en-IN",
  "workspaceName": "prod-ap-south-1",
  "history": [],
  "scanResult": null,
  "incident": null,
  "artifactText": null
}
```

**Valid `contextType` values:** `general`, `shipsafe`, `incident`, `kubernetes`, `docker`, `terraform`, `cicd`  
**Valid `language` values:** `en-IN`, `hi-IN`, `te-IN`, `ta-IN`, `kn-IN`

### `POST /api/incidents/investigate`
Generates a structured root-cause investigation report for an incident evidence payload.

**Request Body:**
```json
{
  "incident": {
    "id": "INC-204",
    "title": "Payments API CrashLoopBackOff",
    "severity": "critical",
    "status": "open",
    "affectedService": "payments-api",
    "summary": "All replicas failing on startup",
    "logs": []
  }
}
```

---

## 4. Incident Simulation & Safe Recovery APIs

All simulation endpoints operate strictly on the isolated in-memory `demo-payments-cluster`.

### `GET /api/simulation/state`
Returns the full live snapshot (`simulated: true`, cluster, deployment, pods, service, metrics, `activeIncident`, events, logs, action history, and scenario catalog).

### `GET /api/simulation/events`
Returns `{ "simulated": true, "events": [...] }`.

### `POST /api/simulation/trigger`
Triggers one of the 3 deterministic failure scenarios. Idempotent if the same scenario is already active (`open`, `investigating`, or `recovering`).
- **Rate Limit:** `40 requests / 60s`

```bash
curl -X POST http://localhost:3000/api/simulation/trigger \
  -H "Content-Type: application/json" \
  -d '{"scenarioId": "crashloop_backoff"}'
```
**Valid `scenarioId` values:** `crashloop_backoff`, `probe_misconfiguration`, `resource_pressure`

### `POST /api/simulation/investigate`
Sends live server-authoritative simulation telemetry to Gemini, validates the recommended action against the allowlist, attaches the investigation report + remediation proposal to the active incident, and returns `{ investigation, proposedRemediation, state }`.
- **Error `409`:** No active simulated incident exists.

```bash
curl -X POST http://localhost:3000/api/simulation/investigate
```

### `POST /api/simulation/remediation/approve`
Applies an explicitly approved allowlisted remediation, steps pods through `Starting → Running → Ready`, and runs 5 deterministic verification checks before marking the incident resolved.
- **Rate Limit:** `30 requests / 60s`

```bash
curl -X POST http://localhost:3000/api/simulation/remediation/approve \
  -H "Content-Type: application/json" \
  -d '{
    "incidentId": "SIM-INC-401",
    "actionId": "restore_required_env_config",
    "approved": true
  }'
```

**Valid `actionId` values:** `restore_required_env_config`, `fix_readiness_probe_path`, `adjust_resource_limits_and_hpa`

**Error Codes:**
- `400` — `approved !== true`, disallowed `actionId`, or `actionId` does not match the active scenario's proposed plan
- `409` — No active incident, incident not yet investigated, recovery already in progress, or incident already resolved

### `POST /api/simulation/reset`
Restores `demo-payments-cluster` to its clean `3/3` healthy baseline.
- **Rate Limit:** `30 requests / 60s`

```bash
curl -X POST http://localhost:3000/api/simulation/reset \
  -H "Content-Type: application/json" \
  -d '{"confirmed": true}'
```
- **Error `400`:** Missing `confirmed: true`
