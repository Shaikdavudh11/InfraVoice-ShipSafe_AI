# Step-by-Step User Guide & Workflows

New to **InfraVoice — ShipSafe AI**? This guide walks you through **how the app works** and **how to use every page** step by step.

---

## How the App Works (The Big Picture)

InfraVoice — ShipSafe AI helps developers catch cloud/container misconfigurations **before** deploying and investigate/recover from incidents **safely** using natural language:

```text
1. Pre-Ship Check (ShipSafe)     -> Upload infra files -> Get deterministic Risk Score & line-level findings
2. Ask AI (InfraVoice)           -> Ask Gemini to prioritize findings or explain errors (by text or voice)
3. Incident Simulation           -> Trigger a realistic failure -> Gemini investigates -> You approve fix -> Verified recovery
```

---

## Navigation Overview

Use the left sidebar to switch between the 7 workspace pages:

| Sidebar Item | Route | What You Do Here |
| --- | --- | --- |
| **Overview** | `/` | See live deployment risk, active incidents, cluster health, and jump straight into any workflow. |
| **ShipSafe Scanner** | `/shipsafe` | Upload real infrastructure configs (`Dockerfile`, K8s, Compose, Terraform, GitHub Actions), scan them, and get Gemini prioritization. |
| **InfraVoice AI** | `/infravoice` | Chat or talk (voice) with Gemini using your live scan results, active simulated incident, or pasted logs as evidence. |
| **Incident Simulation** | `/simulation` | Trigger simulated Kubernetes outages, investigate with Gemini, approve safe fixes, and watch pods recover. |
| **Incident Center** | `/incidents` | Inspect detailed incident timelines, logs, and root-cause analyses (including live simulated incidents). |
| **Scan History** | `/history` | Review scans you ran during this session alongside sample baseline scans, and reopen any live scan in ShipSafe. |
| **Settings** | `/settings` | View live server-side Gemini connection status, workspace preferences, and safety boundaries. |

---

## Workflow 1 — Scan Infrastructure Files Before Shipping (ShipSafe)

Use this workflow to check your `Dockerfile`, Kubernetes YAML, Docker Compose, Terraform `.tf`, or GitHub Actions workflows for security and reliability bugs.

1. Click **ShipSafe Scanner** in the left sidebar.
2. Choose files to scan:
   - **Fastest way to try it:** Click **Load Demo Vulnerable Configs** to load 4 realistic misconfigured files (`Dockerfile`, `k8s-deployment.yaml`, `main.tf`, `deploy.yml`).
   - **Your own files:** Drag-and-drop or browse to upload up to 20 files (max 1 MB each, 5 MB total).
3. Click **Scan Infrastructure**.
4. Review the **Deterministic Scan Results**:
   - **Risk Score (0–100)** and verdict (`Critical`, `High`, `Moderate`, `Low`).
   - Filter findings by **severity** (`Critical`, `High`, `Medium`, `Low`, `Info`), **file type**, or search text.
   - Click any finding to see the **exact file name, line number, redacted evidence snippet, impact, and recommended fix**.
5. **Get AI Prioritization (Gemini):**
   - Click **Analyze with Gemini** to generate an executive summary, release decision, prioritized top fixes, and a hardening checklist.
6. **Discuss in Chat:**
   - Click **Ask InfraVoice** on the scan or any specific finding to jump directly into InfraVoice AI with that scan attached automatically.

---

## Workflow 2 — Talk or Chat with Your Infrastructure (InfraVoice AI)

Use this workflow to ask engineering questions grounded in your real scan findings, active incidents, or pasted logs.

1. Click **InfraVoice AI** in the left sidebar.
2. **Attach Context (Right/Top Context Controls):**
   - Toggle **Attach Latest ShipSafe Scan** if you ran a scan.
   - Pick an **Incident** from the dropdown (including any live simulated incident `SIM-INC-*`).
   - Optionally paste a custom config snippet or error log in the artifact box.
   - Choose your preferred **Language** (`English`, `Hindi`, `Telugu`, `Tamil`, or `Kannada`).
3. **Ask Your Question:**
   - **Typing:** Type a question (or click a suggested prompt chip) and press **Enter** / **Send**.
   - **Voice Input:** Click the **Microphone** icon, speak your question, and release/send.
   - **Voice Replies:** Toggle **Auto-Speak** (or click the speaker icon on a reply) to hear Gemini's answer read aloud.
4. **Follow-Up Questions:**
   - Ask follow-ups like *"Give me the exact YAML patch for the #1 critical issue"* or *"Explain why the pods are stuck in CrashLoopBackOff"*.
   - Switching to a different incident automatically starts a fresh conversation so evidence never mixes between incidents.

---

## Workflow 3 — Trigger, Investigate & Recover a Simulated Outage

Use this workflow to experience safe, human-in-the-loop incident response inside the isolated `demo-payments-cluster` sandbox.

1. Click **Incident Simulation** in the left sidebar.
2. Confirm the baseline banner shows **Healthy — 3/3 Ready Pods** on `deployment/payments-api`.
3. **Step 1 — Trigger a Failure:**
   - Select one of the 3 scenarios:
     - **Scenario A:** *Payments API Crash Loop* (missing secret reference → `CrashLoopBackOff`, `0/3` ready).
     - **Scenario B:** *Failed Readiness Probe* (wrong `/internal/healthz-v2` path → HTTP 404, `0/3` ready).
     - **Scenario C:** *CPU/Memory Resource Pressure* (tight `150m / 128Mi` limits → `OOMKilled`, `1/3` ready, high latency).
   - Review the **What Will Be Simulated** preview and click **Trigger Incident**.
   - Observe live pod phases, restart counts, service health, error rates, logs, and timeline update immediately.
4. **Step 2 — Investigate with Gemini:**
   - Click **Investigate with InfraVoice**.
   - Wait ~8–10 seconds while Gemini analyzes the live simulated logs, pod phases, events, and deployment config.
   - Review the structured **Investigation Report** (root cause, confidence level, evidence, impacted resources) and the **Proposed Safe Remediation** (verified against the server allowlist).
   - *(Optional)* Click **Open Chat** to ask Gemini deeper follow-up questions about this live incident.
5. **Step 3 — Explicit Human Approval:**
   - Click **Review & Approve Remediation**.
   - Inspect the before-state, expected after-state, risk level, and verification requirement.
   - Notice that clicking **Cancel** leaves the cluster untouched—nothing executes without your explicit approval.
   - Click **Approve & Apply Simulation** to authorize recovery.
6. **Step 4 — Watch Stepped Recovery & Verification:**
   - Pods transition live through `Starting → Running → Ready (3/3)`.
   - The server runs **5 deterministic verification checks** (replica count, pod health, readiness/liveness probes, service endpoints, resource stability).
   - The incident status changes to **Resolved** *only after* all 5 checks pass.
7. **Step 5 — Reset for Next Run:**
   - Click **Reset Simulation** and confirm to restore the cluster back to a spotless `3/3` healthy baseline.

---

## Workflow 4 — Track History & Check System Status

- **Scan History (`/history`):** Every real scan you run in ShipSafe is added to the top of your session history. Click any live session scan to reload its findings back into ShipSafe.
- **Overview (`/`)**: Automatically updates its KPIs to reflect your latest live ShipSafe Risk Score and any active simulated incident.
- **Settings (`/settings`):** Shows whether Gemini is connected on the server, the active provider (`gemini-developer-api` or `vertex-ai`), and the active model (`gemini-4-hydrogen`).
