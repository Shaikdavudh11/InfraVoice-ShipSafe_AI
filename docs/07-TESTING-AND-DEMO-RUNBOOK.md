# Testing Guide & Live Hackathon Demo Runbook

Use this guide to run all automated verification commands and deliver a smooth, repeatable 3–5 minute live demonstration.

---

## 1. Automated Verification Commands

All automated checks run offline without requiring live Gemini API keys:

```bash
# Run all 4 Vitest suites (50 automated tests)
npm test

# TypeScript strict type-checking (0 errors expected)
npm run lint

# Production frontend bundle verification
npm run build
```

### What the 4 Test Suites Cover

| Test File | Tests | Scope |
| --- | --- | --- |
| `src/lib/shipsafe/__tests__/shipsafe.test.ts` | 12 | File classification (Dockerfile, K8s, Compose, Terraform, GH Actions), rule detection, secret redaction, deterministic risk scoring, clean file = 0 score, upload rejection limits. |
| `src/lib/ai/__tests__/ai-services.test.ts` | 15 | Gemini service validation, Zod structured output handling, read-only tool registry execution, 429 rate-limit & timeout resilience, secret sanitization. |
| `src/lib/simulation/__tests__/simulation.test.ts` | 11 | Scenario triggering, Gemini investigation error propagation, approval allowlist enforcement, stepped recovery (`Starting → Running → Ready`), verification pass/fail behavior, reset confirmation gate. |
| `src/lib/__tests__/phase5-integration-security.test.ts` | 12 | Prompt delimiter escape neutralization (`</untrusted_data>`), defensive HTTP headers, malformed JSON `400`, path traversal & binary upload rejection, double-click idempotency, duplicate approval `409`, full 3-scenario lifecycle, and InfraVoice context isolation. |

---

## 2. Pre-Demo Checklist (30 Seconds Before Presenting)

1. Open `http://localhost:3000` (or your shared preview URL).
2. Visit **Settings (`/settings`)** and confirm Gemini status shows **Connected (`gemini-4-hydrogen`)**.
3. Visit **Incident Simulation (`/simulation`)** and confirm the cluster shows **Healthy (`3/3` Ready Pods)** with no active incident. If an old incident is open, click **Reset Simulation → Confirm**.
4. *(Optional)* If demonstrating voice input, open the app in Chrome or Edge and allow microphone access ahead of time.

---

## 3. Live 3–5 Minute Hackathon Demo Script

### Minute 0:00–0:45 — Overview & Problem Statement (`/`)
- Start on **Overview (`/`)**.
- **Say:** *"InfraVoice — ShipSafe AI helps engineering teams catch cloud and container risks before shipping, talk to their infrastructure using Google Gemini, and recover from outages with human-in-the-loop safety."*
- Point out the live `demo-payments-cluster` status (`3/3` healthy) and clean dashboard layout.

### Minute 0:45–1:45 — ShipSafe Real Scanner (`/shipsafe`)
- Navigate to **ShipSafe Scanner**.
- Click **Load Demo Vulnerable Configs** → **Scan Infrastructure**.
- Highlight the instant **deterministic** output (`Risk Score 86 — Critical`, `12` findings across `Dockerfile`, Kubernetes YAML, Terraform, and GitHub Actions—each with exact file name, line number, and redacted evidence).
- Click **Analyze with Gemini** (~20s) to show the AI executive summary, release block recommendation, and prioritized top fixes.
- *(Tip: While Gemini analyzes, expand 1–2 findings like `TF001` public SSH or `KS001` privileged container to show exact line evidence and fix snippets.)*

### Minute 1:45–2:30 — InfraVoice AI Grounded Chat (`/infravoice`)
- Click **Ask InfraVoice** from the scan results.
- Ask (via keyboard or microphone): *"Which two findings block production release first and why?"*
- Point out that Gemini grounds its answer strictly in your real scan ID and rule IDs (`KS001`, `TF001`), never hallucinating findings.
- Ask a quick follow-up: *"Give me a concise 3-step fix sequence."*

### Minute 2:30–4:30 — Incident Simulation & Safe Recovery (`/simulation`)
- Navigate to **Incident Simulation**.
- Point out the clear **Simulated Environment** banner (`demo-payments-cluster` — isolated sandbox, never touches real cloud infrastructure).
- Select **Scenario A — Payments API Crash Loop** and click **Trigger Incident**.
  - Show pods dropping immediately to `0/3` Ready (`CrashLoopBackOff`), service turning critical, and live logs showing `FATAL: Missing required env PAYMENTS_SIGNING_CONFIG`.
- Click **Investigate with InfraVoice** (~8s).
  - Show Gemini's structured root-cause diagnosis (`payments-signing-config` secretRef removed in rollout rev 14) and validated allowlisted remediation plan (`restore_required_env_config`).
- Click **Review & Approve Remediation**.
  - Highlight the **Human-in-the-Loop Gate**: show before-state vs expected after-state, risk level, and verification requirement. Mention that nothing executes without explicit engineer approval.
- Click **Approve & Apply Simulation**.
  - Watch pods transition live (`Starting → Running → Ready 3/3`) and pass **5/5 deterministic verification checks** before the incident resolves.

### Minute 4:30–5:00 — Clean Reset & Wrap-Up
- Click **Reset Simulation → Confirm** to return `demo-payments-cluster` to `3/3` healthy baseline.
- Optionally show **Overview (`/`)** or **Scan History (`/history`)** now reflecting the live scan you just ran during the demo.

---

## 4. Fallback Tips If Live Network Is Slow

- **ShipSafe Scanner (`/shipsafe`)** and **Simulation Trigger / Reset (`/simulation`)** are 100% deterministic and run in `<50ms` even without internet access.
- If a Gemini request takes longer than expected or hits a transient rate limit, the UI displays a clear retryable notice without crashing or freezing—simply click retry once.
