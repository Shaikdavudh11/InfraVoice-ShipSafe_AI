# InfraVoice — ShipSafe AI (Phase 1A)

> **Talk to your infrastructure. Ship with confidence.**  
> Hackathon Sector: Open India / Open Innovation

InfraVoice — ShipSafe AI is an AI-assisted DevOps security and incident workspace designed for developers and small engineering teams to inspect deployment risks before shipping, investigate Kubernetes failures with evidence, and review safe recovery actions.

## Tech Stack (Repository Foundation)

- **Framework:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS v4 (dark-first engineering palette with emerald accent)
- **Icons:** Lucide React
- **Typography:** Plus Jakarta Sans, DM Sans, JetBrains Mono

*(Note: Preserved the repository's existing Vite + React + TypeScript architecture while implementing full client-side route navigation across `/`, `/shipsafe`, `/infravoice`, `/incidents`, `/history`, and `/settings`.)*

## Setup & Run Instructions

```bash
# Install dependencies
npm install

# Start development server on port 3000
npm run dev

# Type-check
npm run lint

# Build production bundle
npm run build
```

## Phase 1A — Completed Deliverables

1. **Application Shell (`src/components/layout/AppShell.tsx`)**
   - Collapsible desktop sidebar + responsive mobile drawer
   - Active workspace switcher (`payments-prod`, `upi-gateway-core`, `checkout-staging`)
   - Interactive notifications inbox with unread counter & mark-read actions
   - Profile footer linking to Settings
2. **Overview Dashboard (`/`)**
   - 4 workspace KPI cards (Deployment Risk Status, Security Findings, Recent Incidents, Infrastructure Health)
   - SVG risk score arc gauge + 14-day trend sparkline + recent scan summary
   - Interactive severity distribution bar linking directly to filtered ShipSafe findings
   - Quick Actions (`Scan Configuration`, `Ask InfraVoice`, `Investigate Incident`)
   - Filterable Recent Activity feed
3. **ShipSafe — Deployment Security (`/shipsafe`)**
   - Drag-and-drop & local file browser supporting `Dockerfile`, `YAML`, `Terraform (.tf)`, and `GitHub Actions (.yml)`
   - Sample configuration presets and local static preview scanner
   - Category tabs, severity filters, search, offending snippet & remediation code blocks with copy buttons, and `"Ask InfraVoice"` context handoff
4. **InfraVoice — AI Assistant (`/infravoice`)**
   - Natural language chat interface with 4 suggested diagnostic prompt cards
   - Structured responses (summary, contributing causes, safe CLI/YAML remediation steps)
   - Interactive Microphone Voice Preview UI state
   - Dynamic Evidence Context panel linking cluster events, logs, and ShipSafe findings
5. **Incident Center (`/incidents`)**
   - Filterable incident queue by status, severity, and search
   - Detail view with local status updates, Timeline, level-filterable Logs viewer, Root Cause analysis, and copyable Recovery Actions
6. **Scan History (`/history`)**
   - Sortable, filterable, searchable scan audit table with slide-over detail drawer
7. **Settings (`/settings`)**
   - Workspace configuration, live Dark/Light theme switcher, compact sidebar toggle, notification preferences, and Phase 2 AI/Voice placeholder controls (no API keys exposed in frontend)
8. **Reusable Components & Centralized Mock Data**
   - `src/components/ui/` (`Surface`, `SeverityLabel`, `CodeBlock`, `States`)
   - `src/data/mockData.ts` & `src/types/infravoice.ts`

## Intentionally Deferred to Phase 2+

- Live Gemini API orchestration and streaming assistant responses
- Real-time microphone audio capture and Speech-to-Text transcription
- Live Kubernetes API / EKS / CloudWatch / Prometheus connectors
- Persistent backend database storage, GitHub OAuth, and webhook alerting
- Automated CI/CD PR checks and real-time static policy engine execution on server
