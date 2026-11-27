# Setup & Installation Guide

This guide explains how to configure, run, and verify **InfraVoice — ShipSafe AI** locally or inside Google AI Studio.

---

## 1. Prerequisites

- **Node.js:** `v20+` (tested on `v22.x`)
- **npm:** Included with Node.js
- **Gemini API Access (for AI features):**
  - **In AI Studio:** `GEMINI_API_KEY` is automatically injected from the platform **Secrets** panel.
  - **Local development:** Add `GEMINI_API_KEY` to a local `.env` file (never commit `.env`).
- **Browser (for Voice features):** Chromium-based browser (Chrome / Edge) recommended for Web Speech API voice input and spoken replies. Full keyboard/text mode works in all modern browsers.

---

## 2. Environment Variables

Inspect `.env.example` for reference. All AI credentials stay strictly on the server—there is no API key input anywhere in the frontend UI.

### Option A — Gemini Developer API (Default in AI Studio)

```bash
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-4-hydrogen"
GOOGLE_GENAI_USE_VERTEXAI="false"
```

### Option B — Google Cloud Vertex AI (Optional, for Cloud Run / GCE)

```bash
GOOGLE_GENAI_USE_VERTEXAI="true"
GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
GOOGLE_CLOUD_LOCATION="us-central1"
GEMINI_MODEL="gemini-4-hydrogen"
```

### Optional Tuning Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port for the Express API + Vite server |
| `AI_REQUEST_TIMEOUT_MS` | `45000` | Server timeout (ms) for Gemini requests |
| `AI_MAX_OUTPUT_TOKENS` | *(model default)* | Optional cap on Gemini response tokens |
| `AI_RATE_LIMIT_MAX_REQUESTS` | `20` | Max AI requests per client IP per window |
| `AI_RATE_LIMIT_WINDOW_MS` | `60000` | Sliding rate-limit window in milliseconds |

---

## 3. Install & Start the Application

```bash
# 1. Install all dependencies
npm install

# 2. Start the full-stack development server (Express API + Vite frontend on port 3000)
npm run dev
```

Once started, open:
- **Web App:** `http://localhost:3000`

### Production Build & Run

```bash
# Build the optimized frontend bundle into dist/
npm run build

# Start in production mode (serves dist/ + /api/* routes on port 3000)
NODE_ENV=production npm start
```

---

## 4. Verify Everything Is Running

Run these quick checks in your terminal or browser:

1. **Server Health:**
   ```bash
   curl http://localhost:3000/api/health
   ```
   Expected response:
   ```json
   {
     "status": "ok",
     "service": "infravoice-shipsafe",
     "aiConfigured": true
   }
   ```

2. **Gemini AI Status:**
   ```bash
   curl http://localhost:3000/api/ai/status
   ```
   Expected response:
   ```json
   {
     "configured": true,
     "provider": "gemini-developer-api",
     "model": "gemini-4-hydrogen"
   }
   ```

3. **Run Automated Tests & Type Check:**
   ```bash
   npm test    # Runs all 50 automated tests (no API key required)
   npm run lint # Runs TypeScript type-checking (tsc --noEmit)
   ```

---

## 5. Common Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `aiConfigured: false` in `/api/health` | `GEMINI_API_KEY` is missing in Secrets / `.env` | Add `GEMINI_API_KEY` in AI Studio Secrets (or `.env` locally) and restart the server. Note: ShipSafe scanning and Simulation trigger/reset still work without an API key! |
| Port `3000` already in use | Another process is bound to port 3000 | Stop the conflicting process or restart the dev server. |
| Microphone button unavailable | Browser does not support Web Speech API or mic permission was denied | Use Chrome/Edge and allow microphone access, or type normally in the chat box. |
| Simulation state reset unexpectedly | Server restarted | Simulation state is intentionally stored in memory and resets cleanly to `3/3` healthy pods on restart. |
