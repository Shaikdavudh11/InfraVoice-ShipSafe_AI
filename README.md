# InfraVoice — ShipSafe AI

> **Talk to your infrastructure. Ship with confidence.**  
> Hackathon Sector: Open India / Open Innovation

InfraVoice — ShipSafe AI is a developer security and SRE workspace that pairs a deterministic static infrastructure scanner (**ShipSafe**) with server-side **Google Gemini** reasoning (**InfraVoice AI** & **Incident Intelligence**).

---

## Architecture Overview

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4 (`src/`)
- **Server:** Express API + Vite SSR/static middleware on port `3000` (`server.ts`)
- **Phase 2 Deterministic Scanner (`src/lib/shipsafe/`):**
  - Stateless upload & rule engine for `Dockerfile`, `Dockerfile.*`, `.dockerignore`, Kubernetes YAML, Docker Compose, Terraform (`.tf`), and GitHub Actions workflows.
  - Produces reproducible findings, line numbers, sanitized evidence snippets, and a deterministic Risk Score (`0–100`).
- **Phase 3 Gemini Intelligence Layer (`src/lib/ai/`):**
  - **Model Abstraction (`ai-config.ts`, `gemini-client.ts`):** Uses `@google/genai` server-side (`gemini-4-hydrogen` default; supports either Google Cloud Vertex AI via ADC or Gemini Developer API via `GEMINI_API_KEY`).
  - **Prompt Injection & Secret Defense (`context-sanitizer.ts`):** Redacts credential tokens/assignments, enforces history & context character budgets, and wraps untrusted configs/logs in `<untrusted_data>` blocks.
  - **Read-Only Tool Registry (`tools/`):** Allowlisted tools (`analyze_logs`, `explain_kubernetes_resource`, `inspect_scan_findings`, `summarize_incident_evidence`, `analyze_dockerfile`, `analyze_terraform`, `get_deployment_context`, `get_pod_status`) with Zod argument validation and transparent UI traces.
  - **Structured AI Services (`services/`):**
    - `POST /api/infravoice/chat` — Context-aware DevOps & SRE assistant (English, Hindi, Telugu, Tamil, Kannada).
    - `POST /api/shipsafe/analyze` — On-demand P0–P3 remediation planning grounded on deterministic ShipSafe findings.
    - `POST /api/incidents/investigate` — Structured SRE investigation strictly separating Confirmed Evidence, Inferred Causes, and Unverified Hypotheses.
    - `GET /api/ai/status` — Safe AI readiness metadata (never exposes secrets).
- **Browser Voice Support (`src/lib/voice/speech-client.ts`):**
  - Uses standard browser **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition` + `speechSynthesis`) with editable transcription and graceful fallback when unsupported or denied.

---

## Environment Setup

Copy `.env.example` or configure secrets in your runtime environment (never expose keys to frontend code):

```bash
# Option A: Gemini Developer API (AI Studio Secrets)
GEMINI_API_KEY="your-key"
GEMINI_MODEL="gemini-4-hydrogen"
GOOGLE_GENAI_USE_VERTEXAI="false"

# Option B: Google Cloud Vertex AI (Cloud Run / GCE ADC)
GOOGLE_GENAI_USE_VERTEXAI="true"
GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
GOOGLE_CLOUD_LOCATION="us-central1"
# Locally: GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
```

---

## Local Run & Test Commands

```bash
# Install dependencies
npm install

# Run development server on port 3000
npm run dev

# Run deterministic + mocked Gemini test suites
npm test

# Type-check & production build
npm run lint
npm run build
```

---

## Cloud Run Deployment Notes

- Set `NODE_ENV=production` and `PORT=3000` (or Cloud Run injected `PORT`).
- Prefer attaching a least-privilege IAM service account (`roles/aiplatform.user`) with `GOOGLE_GENAI_USE_VERTEXAI="true"` and `GOOGLE_CLOUD_PROJECT` so no static API key file is shipped inside the container.
- All Gemini calls and rate limiters execute strictly on the Express server (`npm run start` runs `node server.ts`).
