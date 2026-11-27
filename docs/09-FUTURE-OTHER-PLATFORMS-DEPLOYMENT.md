# Future Multi-Platform Deployment Guide (Outside Google Cloud)

> **Scope Note:** For the current hackathon submission, keep deployment strictly on **Google Cloud** (see [`docs/08-GOOGLE-CLOUD-DEPLOYMENT.md`](./08-GOOGLE-CLOUD-DEPLOYMENT.md)).  
> Use this guide **in the future** if you ever want to host **InfraVoice — ShipSafe AI** on another cloud or container platform.

---

## 1. Universal Requirements (Applies to Every Platform)

Because this app runs a **single Node 22 Express server (`server.ts`)** that serves both the React frontend (`dist/`) and server-side `/api/*` routes, any hosting provider you choose must support:

1. **Docker container hosting** (using the included `Dockerfile` — recommended) **OR** a persistent **Node.js `v22+` web service**.
2. **Environment variables:**
   - `NODE_ENV=production`
   - `GEMINI_API_KEY=<your-secret-key>` *(stored in the platform's encrypted Secrets/Env panel — never in git)*
   - `GEMINI_MODEL=gemini-4-hydrogen` *(optional; defaults automatically)*
   - `PORT` *(automatically injected by most platforms; `server.ts` reads `process.env.PORT` and binds `0.0.0.0`)*
3. **Health Check Path:** `GET /api/health` (returns HTTP `200`).
4. **Request Timeout:** Set to at least **`60 seconds`** so structured Gemini analysis calls (`POST /api/shipsafe/analyze`) never time out.
5. **Single Instance (`max instances = 1`):** Because Incident Simulation state lives in server memory, run **1 instance** unless you later migrate `src/lib/simulation/state-manager.ts` to Redis or a database.

> **Important Note About Static / Serverless-Only Platforms (Vercel, Netlify, Cloudflare Pages):**  
> This app uses a stateful Express server (`server.ts`) with `multer` multipart uploads and an in-memory simulation store. Static-only hosts (Netlify static, GitHub Pages) cannot run `/api/*`, and serverless function platforms (Vercel) do not keep in-memory simulation state across invocations unless you refactor `server.ts` into serverless routes and move simulation state to a database/KV store. **Container / Web Service platforms below work out-of-the-box with zero code changes.**

---

## 2. Platform-by-Platform Guides

### Option A — Render (Easiest Docker / Node Web Service)

1. Push your repository to GitHub (make sure `.env` is NOT committed).
2. In the **Render Dashboard**, click **New + → Web Service** and connect your repository.
3. Choose **Runtime: Docker** (Render automatically detects `/Dockerfile`).
   - *(Or choose **Node**, Build Command: `npm install && npm run build`, Start Command: `NODE_ENV=production node server.ts` with Node 22.)*
4. Set **Instance Count:** `1`.
5. Under **Environment Variables**, add:
   - `NODE_ENV` = `production`
   - `GEMINI_API_KEY` = *(mark as Secret)*
   - `GEMINI_MODEL` = `gemini-4-hydrogen`
6. Under **Advanced → Health Check Path**, set `/api/health`.
7. Click **Create Web Service**. Render builds the Docker image and gives you an HTTPS URL.

---

### Option B — Railway (Fast Zero-Config Container Deploy)

1. Push your repository to GitHub.
2. In **Railway**, click **New Project → Deploy from GitHub repo**.
3. Railway automatically detects `/Dockerfile`.
4. Open **Variables** and add:
   - `NODE_ENV=production`
   - `GEMINI_API_KEY=<secret>`
   - `GEMINI_MODEL=gemini-4-hydrogen`
5. Open **Settings → Networking → Generate Domain** to get a public HTTPS URL.
6. Set **Healthcheck Path** to `/api/health` and **Replicas** to `1`.

---

### Option C — Fly.io (Global Edge Containers)

1. Install `flyctl` and sign in (`fly auth login`).
2. From the project root, initialize without deploying yet:
   ```bash
   fly launch --no-deploy --name infravoice-shipsafe --region bom
   ```
   *(Fly detects `/Dockerfile` automatically; `bom` = Mumbai.)*
3. Set the Gemini secret securely:
   ```bash
   fly secrets set GEMINI_API_KEY="your-key" GEMINI_MODEL="gemini-4-hydrogen" NODE_ENV="production"
   ```
4. Ensure `fly.toml` sets `internal_port = 8080`, `min_machines_running = 0`, and deploy with 1 machine:
   ```bash
   fly deploy
   fly scale count 1
   ```

---

### Option D — AWS App Runner (Managed AWS Container Service)

1. Build and push the Docker image to **Amazon ECR** (or connect your GitHub repo directly).
2. In **AWS App Runner**, click **Create service**:
   - Source: Container registry (ECR image)
   - Port: `8080`
   - CPU / Memory: `1 vCPU / 2 GB` (or `0.5 vCPU / 1 GB`)
   - Auto scaling: Max size = `1` (for consistent in-memory simulation state)
   - Health check: HTTP `GET /api/health`
3. Store `GEMINI_API_KEY` in **AWS Secrets Manager** and attach it to the App Runner service via its Instance Role, alongside plain env vars `NODE_ENV=production` and `GEMINI_MODEL=gemini-4-hydrogen`.

---

### Option E — Azure Container Apps

1. Push the Docker image to **Azure Container Registry (ACR)** (`az acr build --registry <acr> --image infravoice-shipsafe:v1 .`).
2. Create an **Azure Container App**:
   - Ingress: External, target port `8080`
   - Scaling: `min-replicas 0`, `max-replicas 1`
   - Secrets: Store `gemini-api-key` in **Azure Key Vault** or Container App Secrets and map it to env var `GEMINI_API_KEY`
   - Env vars: `NODE_ENV=production`, `GEMINI_MODEL=gemini-4-hydrogen`
   - Liveness/Readiness probe: HTTP `GET /api/health` on port `8080`

---

### Option F — DigitalOcean App Platform

1. Connect your GitHub repo in **DigitalOcean App Platform → Create App**.
2. DigitalOcean automatically detects `/Dockerfile`.
3. Configure HTTP port `8080`, **Instance Count: `1`**, Health Check `/api/health`.
4. Add `GEMINI_API_KEY` as an **Encrypted** environment variable, plus `NODE_ENV=production` and `GEMINI_MODEL=gemini-4-hydrogen`.

---

### Option G — Self-Hosted VPS / Linux Server (Docker + Nginx / Caddy)

On any Ubuntu/Debian VM with Docker installed:

```bash
# 1. Build the production container image
docker build -t infravoice-shipsafe:latest .

# 2. Run on localhost:8080 with env file (chmod 600 .env.prod)
docker run -d \
  --name infravoice-shipsafe \
  --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  --env-file .env.prod \
  infravoice-shipsafe:latest

# 3. Verify health
curl http://127.0.0.1:8080/api/health
```

Put **Caddy** (automatic HTTPS) or **Nginx + Certbot** in front of `127.0.0.1:8080` with `proxy_read_timeout 65s;` so Gemini responses are never cut off prematurely.

---

## 3. Scaling Beyond 1 Instance in the Future

If you later scale this project to multi-user production with multiple container replicas:
1. Move `src/lib/simulation/state-manager.ts` from in-memory variables to **Redis** or **PostgreSQL / Firestore** keyed by user/session ID.
2. Move `src/lib/ai/rate-limiter.ts` from in-memory `Map` to a shared **Redis** sliding-window counter.
3. Persist `sessionScanHistory` in a database behind user authentication.
