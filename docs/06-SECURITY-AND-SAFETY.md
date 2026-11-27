# Security, Guardrails & Safety Boundaries

InfraVoice — ShipSafe AI is designed with defense-in-depth guardrails so developers can safely inspect untrusted infrastructure files and run incident response simulations without risking credentials or real cloud environments.

---

## 1. Secret & Credential Protection

- **Server-Only AI Credentials:** `GEMINI_API_KEY` is read exclusively inside `server.ts` / `src/lib/ai/ai-config.ts`. The browser never receives API keys, never imports `@google/genai`, and has no API key input forms.
- **Git Protection:** `.gitignore` ignores all `.env*` files while keeping `.env.example` tracked.
- **Automatic Evidence Redaction:** `src/lib/shipsafe/secret-sanitizer.ts` scrubs AWS access keys (`AKIA...`), GitHub tokens (`ghp_...`, `github_pat_...`), API keys (`AIza...`, `sk-...`), private PEM key blocks, basic-auth database URLs, and sensitive `KEY=value` assignments before findings or AI prompts are returned.
- **Credential Upload Prevention:** `.env` files are rejected by the scanner and excluded from the UI file picker.

---

## 2. File Upload & Parser Safety

`POST /api/shipsafe/scan` and `src/lib/shipsafe/file-detector.ts` enforce strict boundaries:

- **In-Memory Only:** Files are uploaded via `multer.memoryStorage()`, decoded to UTF-8, and their raw buffers are explicitly zeroed (`Buffer.alloc(0)`) immediately after decoding—nothing is written to disk.
- **Size & Count Caps:** Max `20` files per scan, max `1 MB` per file, max `5 MB` total request payload (enforced upfront via `Content-Length` and inside `multer`).
- **Filename Validation:** Rejects path traversal (`..`), absolute paths, backslashes, control characters, and filenames over 200 characters.
- **Content Checks:** Rejects empty files, binary NUL-byte payloads, malformed YAML, and unsupported file extensions.
- **No Code Execution:** Uploaded Dockerfiles, Terraform HCL, YAML manifests, and workflow files are analyzed purely as static text/data—never executed.

---

## 3. AI Prompt Injection & Context Isolation

- **Untrusted Data Boundaries (`src/lib/ai/context-sanitizer.ts`):** Every user-supplied config, scan finding, log stream, incident description, and query is wrapped in `<untrusted_data source="...">...</untrusted_data>` tags.
- **Delimiter Neutralization:** Any literal `<untrusted_data>` or `</untrusted_data>` tags embedded inside hostile logs or Dockerfiles are replaced with `[delimiter_neutralized]` before wrapping, preventing attackers from escaping the data block.
- **Injection Detection:** Scans untrusted inputs for instruction overrides, secret extraction attempts, approval-bypass phrasing, and `system:`/`assistant:` role spoofing, injecting an explicit warning annotation when detected.
- **Read-Only Tool Allowlist:** Gemini can only call the 8 registered read-only inspection functions in `src/lib/ai/tools/tool-registry.ts`. Arbitrary tool names or write actions are rejected.
- **Strict Per-Thread Context Isolation:** Switching incidents or launching a new scan/incident chat in InfraVoice starts a fresh `conversationId` and clears prior turns so evidence never leaks across contexts.

---

## 4. Human-in-the-Loop & Simulation Isolation

- **Zero Real Infrastructure Access:** `src/lib/simulation/` contains **no** `child_process`, **no** Kubernetes client (`@kubernetes/client-node`), **no** Docker SDK, and **no** Terraform/cloud CLI calls.
- **Strict Action Allowlist (`src/lib/simulation/remediation-validator.ts`):** Only 3 predefined in-memory actions are permitted:
  1. `restore_required_env_config`
  2. `fix_readiness_probe_path`
  3. `adjust_resource_limits_and_hpa`
- **Mandatory Investigation + Explicit Approval:** The server refuses any remediation approval unless:
  - An active incident exists and has been investigated (`proposedRemediation` present),
  - `approved === true` is explicitly sent by the user,
  - `actionId` matches the active incident's proposed allowlisted plan, and
  - Recovery is not already running or resolved (duplicate clicks return `409`).
- **Deterministic Verification Gate:** Incidents are marked `resolved` *only* after all 5 deterministic server-side checks in `verification-service.ts` pass.

---

## 5. API & Client Hardening

- **Defensive HTTP Headers:** Every response sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `Permissions-Policy: camera=(), geolocation=()`, disables `X-Powered-By`, and intentionally omits `X-Frame-Options` so embedded preview iframes work smoothly.
- **Rate Limiting:** Sliding-window per-client limits protect `/api/shipsafe/scan` (`40/min`), `/api/simulation/*` (`30–40/min`), and all Gemini endpoints (`20/min` default).
- **Safe Error Handling:** Malformed JSON returns `400 {"error":"Malformed JSON request body."}` and oversized JSON returns `413` with zero stack traces.
- **Safe Markdown Rendering:** `src/components/ui/MarkdownRenderer.tsx` parses Markdown into React elements without `dangerouslySetInnerHTML`.
