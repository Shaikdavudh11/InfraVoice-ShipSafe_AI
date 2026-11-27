# Google Cloud Deployment Guide (Cloud Run + Cloud Build + Artifact Registry + Secret Manager)

This guide deploys **InfraVoice — ShipSafe AI** strictly on **Google Cloud** as a single, cost-controlled **Cloud Run** service using the production `Dockerfile`, `.dockerignore`, and `cloudbuild.yaml` in this repository.

---

## 1. Architecture Summary

| Layer | Google Cloud Service | Configuration |
| --- | --- | --- |
| **Build** | Google Cloud Build | Multi-stage non-root Node 22 Alpine `Dockerfile` (`cloudbuild.yaml`) |
| **Image Registry** | Google Artifact Registry | Regional Docker repo (`infravoice-repo`) |
| **Secrets** | Google Cloud Secret Manager | `GEMINI_API_KEY` injected at runtime (never baked into image) |
| **Hosting** | Google Cloud Run | Service `infravoice-shipsafe`, `1 vCPU`, `512 MiB`, `timeout=60s`, `min-instances=0`, `max-instances=1` |
| **Observability** | Google Cloud Logging | Built-in Cloud Run request & container logs |

> **Why `max-instances=1`?**  
> The Phase 4 Incident Simulation Engine stores simulated cluster state in server memory (`src/lib/simulation/state-manager.ts`). Setting `--min-instances=0 --max-instances=1` keeps simulated incidents consistent across browser requests during your hackathon demo while scaling to zero when idle (no Firestore or Redis cost required). Note that state resets whenever the container restarts or scales to zero.

---

## 2. Prerequisites (Run in Google Cloud Shell or Local Terminal with `gcloud`)

1. Open **[Google Cloud Shell](https://shell.cloud.google.com/)** (recommended — `gcloud` is pre-installed and authenticated) or your local terminal with `gcloud` installed.
2. Upload or clone this repository into your working directory.
3. Set your target project and region (replace `YOUR_GCP_PROJECT_ID` with your actual project ID):

```bash
export PROJECT_ID="YOUR_GCP_PROJECT_ID"
export REGION="asia-south1"            # Mumbai (or asia-east1 / us-central1)
export SERVICE_NAME="infravoice-shipsafe"
export REPO_NAME="infravoice-repo"

gcloud config set project "${PROJECT_ID}"
gcloud auth list
```

4. Confirm billing is enabled on the project before creating resources:

```bash
gcloud billing projects describe "${PROJECT_ID}" --format="value(billingEnabled)"
# Expected output: True
```

---

## 3. Step 1 — Enable Only the 4 Required Google Cloud APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com
```

---

## 4. Step 2 — Create Artifact Registry Repository

```bash
gcloud artifacts repositories create "${REPO_NAME}" \
  --repository-format=docker \
  --location="${REGION}" \
  --description="Container images for InfraVoice — ShipSafe AI"
```

*(If the repository already exists, skip this step.)*

---

## 5. Step 3 — Store `GEMINI_API_KEY` in Google Cloud Secret Manager

Never put `GEMINI_API_KEY` in `Dockerfile`, source code, or git. Add it securely through **Google Cloud Console → Security → Secret Manager → Create Secret** (name it `GEMINI_API_KEY`), **or** create it locally via standard input so it is not saved in shell history:

```bash
# Create the secret container (empty)
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"

# Add the secret value securely via Console UI (recommended), or interactively without echoing:
read -s -p "Enter GEMINI_API_KEY: " TMP_KEY && echo
printf "%s" "${TMP_KEY}" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
unset TMP_KEY
```

---

## 6. Step 4 — Create a Least-Privilege Cloud Run Service Account

Create a dedicated runtime service account that can **only** read `GEMINI_API_KEY` from Secret Manager (no editor/owner or cluster permissions):

```bash
export RUNTIME_SA="infravoice-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create infravoice-runtime \
  --display-name="InfraVoice Cloud Run Runtime (Least Privilege)"

gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 7. Step 5 — Build & Deploy to Cloud Run

### Option A — Deploy via `gcloud builds submit` + `gcloud run deploy` (Simplest)

```bash
export IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:v1"

# 1. Build & push container image using Google Cloud Build
gcloud builds submit --tag "${IMAGE_URI}" .

# 2. Deploy to Google Cloud Run (public hackathon demo URL)
gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE_URI}" \
  --region="${REGION}" \
  --platform=managed \
  --service-account="${RUNTIME_SA}" \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --timeout=60 \
  --concurrency=40 \
  --min-instances=0 \
  --max-instances=1 \
  --set-env-vars="NODE_ENV=production,GEMINI_MODEL=gemini-4-hydrogen" \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --allow-unauthenticated
```

> **Private access option:** If you want to restrict access to authenticated IAM users instead of public hackathon judges, replace `--allow-unauthenticated` with `--no-allow-unauthenticated`.

### Option B — One-Command Pipeline Using `cloudbuild.yaml`

First grant Cloud Build permission to deploy Cloud Run and act as the runtime service account:

```bash
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/run.admin"

gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/iam.serviceAccountUser"

# Run full build -> push -> deploy pipeline
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions="_REGION=${REGION},_REPOSITORY=${REPO_NAME},_SERVICE_NAME=${SERVICE_NAME},_SERVICE_ACCOUNT=${RUNTIME_SA},_ALLOW_UNAUTHENTICATED=true"
```

---

## 8. Step 6 — Live Production Verification

Fetch your deployed Cloud Run URL and verify every endpoint:

```bash
export LIVE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --format="value(status.url)")

echo "Live URL: ${LIVE_URL}"

# 1. Verify health & defensive headers
curl -i "${LIVE_URL}/api/health"

# 2. Verify Gemini status (never prints secrets)
curl -s "${LIVE_URL}/api/ai/status"

# 3. Verify simulation baseline (3/3 healthy)
curl -s "${LIVE_URL}/api/simulation/state" | head -c 300

# 4. Verify SPA frontend loads
curl -s -o /dev/null -w "Dashboard HTTP %{http_code}\n" "${LIVE_URL}/"
```

Then open `${LIVE_URL}` in your browser and walk through the 7-step live demo checklist in [`docs/07-TESTING-AND-DEMO-RUNBOOK.md`](./07-TESTING-AND-DEMO-RUNBOOK.md):
1. Dashboard loads without console errors
2. ShipSafe scans demo vulnerable configs (`Risk Score 86 / Critical`)
3. Gemini analyzes scan / replies in InfraVoice chat
4. Trigger `CrashLoopBackOff` simulation (`0/3` ready)
5. Investigate with InfraVoice (real Gemini diagnosis)
6. Approve simulated recovery (`Starting → Running → Ready`, `5/5` checks pass)
7. Reset simulation back to `3/3` healthy baseline

---

## 9. View Logs & Clean Up After the Hackathon

### View Production Logs
```bash
gcloud run services logs read "${SERVICE_NAME}" --region="${REGION}" --limit=50
```

### Delete All Created Resources (To Prevent Any Future Charges)
```bash
gcloud run services delete "${SERVICE_NAME}" --region="${REGION}" --quiet
gcloud artifacts repositories delete "${REPO_NAME}" --location="${REGION}" --quiet
gcloud secrets delete GEMINI_API_KEY --quiet
gcloud iam service-accounts delete "${RUNTIME_SA}" --quiet
```
