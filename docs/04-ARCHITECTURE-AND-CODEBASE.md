# Architecture & Codebase Map

This guide explains how the frontend, Express backend, ShipSafe scanner, Gemini AI layer, and Simulation Engine connect together, along with a complete folder map.

---

## 1. High-Level System Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│                  React 19 + Vite + Tailwind v4 Frontend              │
│   AppContext (Shared Route, Live Scan, Session History, Sim State)   │
│   Overview | ShipSafe | InfraVoice | Simulation | Incidents | Hist.  │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ HTTP JSON / Multipart FormData (/api/*)
┌──────────────────────────────────▼───────────────────────────────────┐
│                     Express Server (server.ts :3000)                 │
│  Security Headers │ Rate Limiter │ Multer (Memory) │ Zod Validation  │
├──────────────────────┬───────────────────────┬───────────────────────┤
│  ShipSafe Engine     │  Gemini AI Layer      │  Simulation Engine    │
│  src/lib/shipsafe/   │  src/lib/ai/          │  src/lib/simulation/  │
│                      │                       │                       │
│  • File detector     │  • Context sanitizer  │  • In-memory cluster  │
│  • YAML/HCL/Docker   │  • Prompt boundaries  │  • 3 fault profiles   │
│  • 35+ static rules  │  • 8 read-only tools  │  • Approval validator │
│  • Secret redactor   │  • Zod JSON outputs   │  • Stepped recovery   │
│  • Risk score 0–100  │  • @google/genai SDK  │  • 5-check verifier   │
└──────────────────────┴───────────┬───────────┴───────────────────────┘
                                   │ HTTPS (Server-side only)
                         ┌─────────▼─────────┐
                         │   Google Gemini   │
                         │ (gemini-4-hydrogen)│
                         └───────────────────┘
```

---

## 2. Core Design Principles

1. **Single-Origin Full-Stack Server (`server.ts`):** Express serves all `/api/*` endpoints and mounts Vite dev middleware in development (or `dist/` static files in production) on port `3000`.
2. **Server-Side AI Only:** `@google/genai` is never bundled into the browser. All Gemini prompts, retries, timeouts, and structured Zod parsing happen exclusively on the server.
3. **Deterministic + AI Separation:**
   - **ShipSafe** computes findings and risk scores deterministically first; Gemini interprets and prioritizes them second.
   - **Simulation Verification** determines incident resolution deterministically (5 checks); Gemini never gets to fabricate a "Resolved" state.
4. **Stateless Uploads & In-Memory Sandbox:** Uploaded files live in memory only for the duration of the scan request and are zeroed immediately afterward. Simulation state lives in an isolated in-memory store with zero cloud or shell connections.

---

## 3. Repository Directory Structure

```text
/
├── server.ts                            # Express API entrypoint, middleware, rate limits, security headers
├── index.html                           # HTML entrypoint & page metadata
├── package.json                         # Scripts (dev, start, build, test, lint) & dependencies
├── tsconfig.json                        # TypeScript strict compiler configuration
├── vite.config.ts                       # Vite + React + Tailwind v4 build configuration
├── .env.example                         # Documented environment variable template (no secrets)
├── README.md                            # Project overview & quick links to docs/
│
├── docs/                                # Detailed project documentation (this folder)
│   ├── 01-GETTING-STARTED-SETUP.md
│   ├── 02-USER-GUIDE-WORKFLOW.md
│   ├── 03-FEATURES-AND-CAPABILITIES.md
│   ├── 04-ARCHITECTURE-AND-CODEBASE.md
│   ├── 05-API-REFERENCE.md
│   ├── 06-SECURITY-AND-SAFETY.md
│   └── 07-TESTING-AND-DEMO-RUNBOOK.md
│
└── src/
    ├── main.tsx                         # React DOM root
    ├── App.tsx                          # Client route switcher (7 workspace pages)
    ├── index.css                        # Tailwind CSS v4 import & dark theme tokens
    │
    ├── context/
    │   └── AppContext.tsx               # Global state: route, latestScanResult, sessionScanHistory,
    │                                    # simulationState polling, and cross-page chat launch handoff
    │
    ├── components/
    │   ├── layout/AppShell.tsx          # Dark sidebar navigation, top header, mobile drawer
    │   └── ui/
    │       ├── MarkdownRenderer.tsx     # Safe React-only Markdown renderer (zero dangerouslySetInnerHTML)
    │       └── ...                      # Shared badges, cards, status indicators
    │
    ├── pages/
    │   ├── OverviewPage.tsx             # Live executive KPIs (real scan score + active sim incidents)
    │   ├── ShipSafePage.tsx             # Upload UI, deterministic findings explorer, Gemini analysis panel
    │   ├── InfraVoicePage.tsx           # Chat + voice UI, context pickers, tool activity traces
    │   ├── SimulationPage.tsx           # Scenario selector, live pod/metrics view, approval modal, timeline
    │   ├── IncidentsPage.tsx            # Incident center combining live sim + seeded historical incidents
    │   ├── HistoryPage.tsx              # Live session scan history + sample baseline scans
    │   └── SettingsPage.tsx             # Live read-only /api/ai/status & safety posture display
    │
    ├── data/                            # Seeded sample dashboard & historical demo records
    │
    └── lib/
        ├── shipsafe/                    # Phase 2: Deterministic Infrastructure Scanner
        │   ├── types.ts                 # Scan result, finding, severity, and file summary interfaces
        │   ├── file-detector.ts         # Content + filename classifier & upload size/type checks
        │   ├── secret-sanitizer.ts      # Regex token/password redaction & safe filename validator
        │   ├── risk-score.ts            # Deterministic 0–100 risk score calculator
        │   ├── scan-engine.ts           # Orchestrates validation, rule execution, sorting & summary
        │   ├── demo-bundle.ts           # Built-in 4-file vulnerable sample bundle
        │   ├── rules/                   # Modular rule sets (Dockerfile, K8s, Compose, TF, GH Actions)
        │   └── __tests__/shipsafe.test.ts
        │
        ├── ai/                          # Phase 3: Server-Side Gemini Intelligence Layer
        │   ├── ai-config.ts             # Reads env config (Developer API or Vertex AI, model, timeouts)
        │   ├── gemini-client.ts         # @google/genai client with timeout, retry & typed errors
        │   ├── context-sanitizer.ts     # Secret redaction + <untrusted_data> delimiter neutralization
        │   ├── prompts/system-prompt.ts # Grounded SRE system instructions & safety rules
        │   ├── tools/                   # 8 allowlisted read-only inspection tools + registry
        │   ├── services/
        │   │   ├── chat-service.ts      # Multi-turn InfraVoice chat + tool-calling loop
        │   │   ├── shipsafe-ai-service.ts   # Structured ShipSafe executive analysis
        │   │   └── incident-ai-service.ts   # Structured incident investigation report
        │   └── __tests__/ai-services.test.ts
        │
        ├── simulation/                  # Phase 4: Isolated Incident Simulation & Recovery Engine
        │   ├── types.ts                 # Cluster, deployment, pod, incident, verification schemas
        │   ├── scenarios.ts             # Baseline config + Scenarios A, B, C & 3 allowlisted proposals
        │   ├── state-manager.ts         # In-memory state store, double-click guard, stepped recovery
        │   ├── remediation-validator.ts # Strict allowlist & human-approval (approved: true) gate
        │   ├── verification-service.ts  # 5 deterministic post-recovery health checks
        │   ├── investigation-service.ts # Feeds live sim telemetry to Gemini & validates proposal
        │   └── __tests__/simulation.test.ts
        │
        ├── voice/                       # Browser Web Speech API wrapper (recognition & synthesis)
        │
        └── __tests__/
            └── phase5-integration-security.test.ts  # Phase 5 security, API & isolation suite
```

---

## 4. State Flow Across Pages

- Running a scan on **ShipSafe (`/shipsafe`)** saves `latestScanResult` and prepends it to `sessionScanHistory` in `AppContext.tsx`, immediately updating **Overview (`/`)**, **Scan History (`/history`)**, and **InfraVoice AI (`/infravoice`)**.
- Triggering or recovering an incident on **Incident Simulation (`/simulation`)** updates `simulationState` on the server and in `AppContext.tsx`, immediately updating **Overview (`/`)**, **Incident Center (`/incidents`)**, and the incident picker inside **InfraVoice AI (`/infravoice`)**.
- Launching chat from a finding or incident sets `pendingChatLaunch` in `AppContext.tsx`, automatically switching to `/infravoice`, starting a fresh conversation ID, clearing stale turns, and attaching only the selected context.
