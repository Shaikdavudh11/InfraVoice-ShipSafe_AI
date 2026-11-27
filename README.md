# InfraVoice — ShipSafe AI

> **Talk to your infrastructure. Ship with confidence.**  
> Hackathon Sector: Open India / Open Innovation

InfraVoice — ShipSafe AI is a developer security and SRE workspace uniting a deterministic static infrastructure scanner (**ShipSafe**), server-side **Google Gemini** reasoning (**InfraVoice AI**), and an isolated **Incident Simulation & Safe Recovery Engine**.

---

## Documentation Index

Full documentation is split into dedicated guides under `docs/`:

1. **[Setup & Installation Guide](./docs/01-GETTING-STARTED-SETUP.md)** — Prerequisites, environment variables, starting the server, and troubleshooting.
2. **[Step-by-Step User Guide & Workflows](./docs/02-USER-GUIDE-WORKFLOW.md)** — How the app works and click-by-click instructions for every page.
3. **[Features & Capabilities Guide](./docs/03-FEATURES-AND-CAPABILITIES.md)** — Real vs simulated breakdown, ShipSafe rules, AI tools, voice languages, and simulation scenarios.
4. **[Architecture & Codebase Map](./docs/04-ARCHITECTURE-AND-CODEBASE.md)** — System architecture diagram, folder structure, and shared state flow.
5. **[REST API Reference](./docs/05-API-REFERENCE.md)** — All `/api/*` endpoints, payloads, status codes, rate limits, and `curl` examples.
6. **[Security, Guardrails & Safety Boundaries](./docs/06-SECURITY-AND-SAFETY.md)** — Secret redaction, upload limits, prompt-injection defenses, approval gates, and sandbox isolation.
7. **[Testing Guide & Live Demo Runbook](./docs/07-TESTING-AND-DEMO-RUNBOOK.md)** — Automated test commands, pre-demo checklist, and 3–5 minute presentation script.

---

## Architecture Overview

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4 (`src/`)
  - Shared state (`src/context/AppContext.tsx`) links ShipSafe scans, live session scan history, Incident Simulation telemetry, and InfraVoice chat context across views.
- **Server:** Express API + Vite dev/static middleware on port `3000` (`server.ts`)
  - Stateless REST endpoints with Zod payload validation, per-client rate limiting, iframe-safe security headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`), and sanitized error handling (no stack traces).
- **Phase 1 — Engineering Workspace & Dashboard (`src/pages/OverviewPage.tsx`, `src/components/layout/AppShell.tsx`):**
  - Dark-first observability dashboard reflecting live ShipSafe scan scores, active simulated incidents, and quick navigation across all workflows.
- **Phase 2 — Deterministic ShipSafe Scanner (`src/lib/shipsafe/`):**
  - Stateless in-memory upload and static rule engine (`POST /api/shipsafe/scan`) for `Dockerfile`, `Dockerfile.*`, `.dockerignore`, Kubernetes YAML, Docker Compose, Terraform (`.tf`), and GitHub Actions workflows.
  - Rejects unsupported types, path-traversal filenames, binary NUL payloads, empty files, >1 MB files, >5 MB total payloads, and >20 files per scan.
  - Produces reproducible findings with rule IDs, file names, line numbers, secret-redacted evidence snippets, remediation examples, and a deterministic Risk Score (`0–100`).
- **Phase 3 — Gemini Intelligence Layer (`src/lib/ai/`):**
  - Server-side `@google/genai` integration (`gemini-4-hydrogen` default) — never imported or called from the browser.
  - Prompt-injection boundary enforcement (`<untrusted_data>` with embedded tag neutralization), secret redaction, read-only allowlisted tools, and Zod-validated structured JSON outputs.
  - Endpoints: `GET /api/ai/status`, `POST /api/infravoice/chat`, `POST /api/shipsafe/analyze`, `POST /api/incidents/investigate`.
- **Phase 4 — Incident Simulation & Safe Recovery Engine (`src/lib/simulation/`):**
  - Isolated in-memory simulated Kubernetes cluster (`demo-payments-cluster`, environment `hackathon-simulation`, namespace `payments`, deployment `payments-api`, service `payments-service`, 3 baseline replicas).
  - Endpoints:
    - `GET /api/simulation/state` — Full live simulated cluster, pod, service, incident, log, and event snapshot.
    - `GET /api/simulation/events` — Chronological simulation event timeline.
    - `POST /api/simulation/trigger` — Triggers Scenario A, B, or C deterministically (idempotent against accidental double-clicks).
    - `POST /api/simulation/investigate` — Sends server-authoritative simulation telemetry to Gemini and validates the proposed remediation against a strict server-side allowlist.
    - `POST /api/simulation/remediation/approve` — Requires explicit user approval (`approved: true`) + allowlisted action ID, steps pods through `Starting → Running → Ready`, and executes 5 deterministic recovery verification checks before resolving the incident.
    - `POST /api/simulation/reset` — Requires explicit confirmation (`confirmed: true`) to restore the 3/3 healthy baseline.

---

## Real Working Features vs Simulated Features

| Capability | Status | Details |
| --- | --- | --- |
| **ShipSafe File Upload & Risk Scanner** | **Real (Deterministic)** | Parses real uploaded files in memory, runs 30+ static security/reliability rules, redacts secrets, and scores `0–100`. |
| **Gemini AI Analysis & InfraVoice Chat** | **Real (Server-Side Gemini)** | Calls Google Gemini (`@google/genai`) server-side for ShipSafe prioritization, multi-turn chat, and incident root-cause investigation. |
| **Voice Input / Spoken Replies** | **Real (Browser Web Speech API)** | Uses browser-native SpeechRecognition / SpeechSynthesis when supported by the browser, with full keyboard/text fallback. |
| **Incident Simulation Cluster & Recovery** | **Simulated (Isolated Sandbox)** | Runs against in-memory `demo-payments-cluster` (`payments-api`). Deterministic telemetry feeds real Gemini reasoning; recovery mutates only in-memory state. |
| **Historical Baseline Records** | **Seeded Sample + Live Session** | Pre-populated sample scans and incidents sit alongside live scans and live simulated incidents created during your session. |

---

## Supported Simulation Scenarios

1. **Scenario A — Payments API Crash Loop (`crashloop_backoff`):** Rollout rev 14 omits required `envFrom.secretRef: payments-signing-config`. All 3 pods enter `CrashLoopBackOff` (`0/3` ready). Allowlisted fix: `restore_required_env_config`.
2. **Scenario B — Failed Readiness Probe (`probe_misconfiguration`):** Rollout rev 14 changes `readinessProbe.httpGet.path` to `/internal/healthz-v2` (HTTP 404). All 3 pods become `NotReady` (`0/3` endpoints). Allowlisted fix: `fix_readiness_probe_path`.
3. **Scenario C — CPU/Memory Resource Pressure (`resource_pressure`):** Rollout rev 14 lowers limits to `150m` CPU / `128Mi` memory. 2/3 pods hit `OOMKilled` (`ExitCode=137`) and the surviving pod throttles at `98%` CPU (`1840ms` p99). Allowlisted fix: `adjust_resource_limits_and_hpa`.

---

## Gemini Integration & Preserved Environment Configuration

The application preserves the configured platform secret (`GEMINI_API_KEY`) and default model (`gemini-4-hydrogen`) via server-side environment variables. API keys are never exposed in client bundles, logs, or UI inputs.

```bash
# Configured automatically via AI Studio Secrets (Gemini Developer API):
GEMINI_API_KEY="your-key"
GEMINI_MODEL="gemini-4-hydrogen"
GOOGLE_GENAI_USE_VERTEXAI="false"

# Optional Vertex AI mode (Cloud Run / GCE Application Default Credentials):
GOOGLE_GENAI_USE_VERTEXAI="true"
GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
GOOGLE_CLOUD_LOCATION="us-central1"
```

---

## Local Development & Test Commands

```bash
npm install     # Install dependencies
npm run dev     # Start Express API + Vite dev server on http://localhost:3000
npm test        # Run all Vitest suites (Phase 2, 3, 4, and 5 integration/security tests — no live keys required)
npm run lint    # TypeScript type-check (tsc --noEmit)
npm run build   # Build production frontend bundle (dist/)
```

---

## Live Demo Walkthrough (3–5 Minutes)

1. **Overview (`/`) & ShipSafe Scanner (`/shipsafe`):** Click **Load Demo Vulnerable Configs** and run **Scan Infrastructure** (`Risk Score 86 — Critical`, 12 deterministic findings across Dockerfile, K8s, Compose, Terraform, and GitHub Actions).
2. **Gemini Prioritization & InfraVoice Chat (`/infravoice`):** Click **Analyze with Gemini** for the structured executive summary and prioritized fixes, then open **Ask InfraVoice** to ask *"Which two issues block production release first?"* and a follow-up for a step-by-step patch plan.
3. **Incident Simulation (`/simulation`):** Select **Scenario A — Payments API Crash Loop** and click **Trigger Incident** (`0/3` ready, `CrashLoopBackOff`, live events/logs).
4. **Gemini Root-Cause Investigation:** Click **Investigate with InfraVoice** to get Gemini's root-cause report (`payments-signing-config` secretRef missing) and validated allowlisted remediation plan (`restore_required_env_config`).
5. **Human-in-the-Loop Approval & Verification:** Review the approval modal (demonstrate **Cancel** safety if desired), then click **Approve & Apply Simulation**. Watch pods transition `Starting → Running → Ready (3/3)` and pass all `5/5` deterministic verification checks before the incident resolves.
6. **Clean Reset:** Click **Reset Simulation** → confirm to restore `demo-payments-cluster` to `3/3` healthy baseline.

---

## Security Boundaries & Known Limitations

- **Zero Real Cluster Execution:** The simulation engine has no Kubernetes client, no Docker/Terraform CLI integration, and no `child_process` calls. It cannot touch real cloud infrastructure.
- **Stateless Uploads & In-Memory Simulation:** Uploaded ShipSafe files are processed strictly in memory and discarded immediately after scanning. Simulation state and live session scan history reset on server restart.
- **Human-in-the-Loop Only:** No simulated remediation executes automatically; the server rejects approvals missing `approved: true`, invalid action IDs, or actions mismatched to the active scenario.
- **Single-Tenant Hackathon Scope:** Authentication and persistent multi-user database storage are intentionally out of scope for the hackathon prototype; rate limiting uses in-memory sliding windows per client IP.
