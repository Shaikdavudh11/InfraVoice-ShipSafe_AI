# Features & Capabilities Guide

This document details every feature built across Phases 1–5 and clearly distinguishes **real working capabilities** from **isolated simulation capabilities**.

---

## 1. Real vs Simulated Matrix

| Feature | Real or Simulated? | How It Works |
| --- | --- | --- |
| **ShipSafe Static Scanner** | **Real (Deterministic)** | Parses real uploaded files in memory, runs 35+ deterministic rules, redacts secrets, and computes a reproducible `0–100` risk score. |
| **Gemini AI Analysis & Chat** | **Real (Server-Side Gemini)** | Calls Google Gemini (`@google/genai`, `gemini-4-hydrogen`) from Express with Zod schema validation and read-only tools. |
| **Voice Input & Spoken Output** | **Real (Browser Web Speech API)** | Uses native browser speech recognition and speech synthesis across 5 Indian & English locales, with full text fallback. |
| **Incident Simulation Cluster** | **Simulated (Isolated Sandbox)** | Runs an in-memory Kubernetes cluster (`demo-payments-cluster`) whose live telemetry feeds real Gemini investigations and deterministic recovery checks. |
| **Baseline Historical Records** | **Seeded Sample + Live Session** | Pre-loaded sample scans and incidents sit alongside every real scan and simulated incident you create during your session. |

---

## 2. ShipSafe Infrastructure Risk Scanner

### Supported File Types
ShipSafe inspects both **filename and file content** (so YAML files are accurately distinguished between Kubernetes, Docker Compose, and GitHub Actions):

- `Dockerfile`, `Dockerfile.*`, `*.dockerfile`
- `.dockerignore`
- Kubernetes manifests (`.yaml` / `.yml` containing `apiVersion` + `kind`)
- Docker Compose (`docker-compose*.yml`, `compose.yaml`, or YAML with `services`)
- Terraform (`.tf`)
- GitHub Actions workflows (`.github/workflows/*.yml` or YAML with `on` + `jobs`)

### Rule Families Built In

| Prefix | Target | Examples of Checks Performed |
| --- | --- | --- |
| `DS001`–`DS008` | **Dockerfile** | Unpinned `:latest` tags, running as `root` (missing `USER`), hardcoded secrets in `ENV`/`ARG`, missing `HEALTHCHECK`, unsafe `curl \| sh`, `ADD` remote URLs, exposed sensitive ports, uncleaned package caches. |
| `DI001`–`DI002` | **.dockerignore** | Missing exclusions for `.env` / secrets or `.git` / `node_modules`. |
| `KS001`–`KS012` | **Kubernetes** | `privileged: true`, running as root (`runAsNonRoot`), missing CPU/memory requests & limits, missing readiness/liveness probes, `hostNetwork`/`hostPID`, `hostPath` mounts, `:latest` images, hardcoded env secrets, overly permissive RBAC wildcards, writable root filesystem, single replica availability risk. |
| `CP001`–`CP007` | **Docker Compose** | `privileged: true`, host network mode, Docker socket mount (`/var/run/docker.sock`), hardcoded credentials in `environment`, `0.0.0.0` sensitive DB ports, `:latest` tags, missing restart policy/limits. |
| `TF001`–`TF007` | **Terraform** | Public `0.0.0.0/0` SSH/RDP/DB ingress, public S3 buckets/ACLs, unencrypted storage/volumes, hardcoded credentials/tokens, wildcard IAM `*` permissions, disabled logging/versioning, unpinned provider constraints. |
| `GA001`–`GA006` | **GitHub Actions** | Unpinned third-party actions (mutable tags instead of commit SHA), excessive `permissions: write-all`, script injection from untrusted PR fields, hardcoded secrets, `pull_request_target` checkout risks, missing concurrency/timeout guards. |

### Deterministic Risk Score (`0–100`)
Calculated strictly from finding severities (independent of AI), ensuring identical files always produce the exact same score:
- **0–19:** Low Risk
- **20–44:** Moderate Risk
- **45–74:** High Risk
- **75–100:** Critical Risk

---

## 3. InfraVoice AI (Server-Side Gemini Assistant)

### Capabilities
- **ShipSafe Scan Intelligence (`POST /api/shipsafe/analyze`):** Converts raw scanner findings into an executive summary, release recommendation (`block` / `conditional` / `approve`), prioritized top fixes, and hardening steps.
- **Grounded Multi-Turn Chat (`POST /api/infravoice/chat`):** Answers questions about attached ShipSafe scans, active simulated incidents, historical incidents, or pasted config/log snippets.
- **Incident Investigation (`POST /api/incidents/investigate` & `POST /api/simulation/investigate`):** Produces a structured SRE root-cause report with confidence rating, supporting evidence, verification steps, and prevention advice.

### 8 Read-Only AI Tools (Allowlisted)
Gemini can autonomously invoke safe, read-only server inspection functions during chat without executing any shell or cloud commands:
1. `inspect_scan_findings` — Filter or retrieve exact ShipSafe findings by rule ID, severity, or file.
2. `analyze_logs` — Extract error patterns, exit codes, and timestamps from attached logs.
3. `summarize_incident_evidence` — Summarize active incident timelines and impacted services.
4. `explain_kubernetes_resource` — Inspect attached K8s pod/deployment specifications.
5. `analyze_dockerfile` — Inspect Dockerfile instructions from attached artifacts.
6. `analyze_terraform` — Inspect Terraform blocks from attached artifacts.
7. `get_deployment_context` — Retrieve deployment revision, probes, and resource limits.
8. `get_pod_status` — Inspect simulated pod phases, readiness, restarts, and CPU/memory usage.

### Multilingual Voice Support
Selectable directly in InfraVoice AI:
- `en-IN` — English (India)
- `hi-IN` — Hindi
- `te-IN` — Telugu
- `ta-IN` — Tamil
- `kn-IN` — Kannada

Technical keywords, YAML/HCL keys, CLI commands, and ShipSafe rule IDs remain in clean ASCII inside code blocks.

---

## 4. Incident Simulation & Safe Recovery Engine

Runs on an isolated in-memory cluster:
- **Cluster:** `demo-payments-cluster` (`hackathon-simulation`, `ap-south-1 (simulated)`)
- **Workload:** `deployment/payments-api` (namespace `payments`, 3 baseline replicas)
- **Service:** `payments-service` (`https://payments.demo-cluster.internal/v1`)

### The 3 Built-In Failure Scenarios

| Scenario | ID | Simulated Fault | Visible Signals | Allowlisted Fix ID |
| --- | --- | --- | --- | --- |
| **Scenario A** | `crashloop_backoff` | Rollout rev 14 removes `envFrom.secretRef: payments-signing-config` | `0/3` ready, `CrashLoopBackOff`, `ExitCode=1`, HTTP 503 | `restore_required_env_config` |
| **Scenario B** | `probe_misconfiguration` | Rollout rev 14 points `readinessProbe` to `/internal/healthz-v2` | `0/3` ready (`NotReady`), `0` restarts, HTTP 404 probe failures | `fix_readiness_probe_path` |
| **Scenario C** | `resource_pressure` | Rollout rev 14 shrinks limits to `150m` CPU / `128Mi` memory | `1/3` ready, 2 pods `OOMKilled (137)`, 98% CPU throttling, 1840ms p99 | `adjust_resource_limits_and_hpa` |

### 5 Deterministic Verification Checks
After an engineer approves a simulated remediation, pods step through `Starting → Running → Ready`, and the incident only resolves if **all 5 checks pass**:
1. Desired vs Ready replicas match (`3/3`)
2. All pods in `Running` phase and `Ready`
3. Readiness and liveness probes passing
4. Service endpoints restored (`3/3`) and error rate normalized
5. CPU & memory utilization within safe thresholds
