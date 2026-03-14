# CLAUDE.md — NeuroFocus: AI Cognitive Support Companion

> "Turns overwhelming into doable."

## Project Overview

Microsoft Innovation Challenge hackathon (March 16–27, 2026). Building an AI cognitive support companion that transforms overwhelming information into calm, structured, personalized clarity for neurodiverse users — and anyone experiencing cognitive overload.

**Challenge:** Cognitive Load Reduction Assistant
**Stack:** Python 3.11+ (FastAPI) backend + JavaScript (React + Tailwind + Framer Motion) frontend
**Judging Criteria (25% each):** Performance, Innovation, Breadth of Azure services, Responsible AI

## How to Use This File

This file is the shared project brain for the whole team. Claude Code reads it automatically every session — so Claude always knows the full project context without anyone having to re-explain it.

**When you learn something new, make a decision, or finish something — update this file.**
That's how the whole team (and Claude) stays in sync. Don't rely on memory or Slack threads for decisions that affect the project. Put it here.

- Diego updates it when backend decisions are made or services are built
- Andy updates it when frontend decisions are made or components are built
- Either person updates it when the product direction changes

## Standing Code Quality Rules (Claude must follow every session)

Before committing or pushing ANY code, Claude must:

1. **Triple-check all code** — read every file modified in the session and verify correctness end-to-end, not just the lines changed
2. **Security audit** — check for: injection flaws (SQL/command/path traversal), insecure deserialization, exposed secrets, missing input validation, improper error handling that leaks internals, CORS misconfiguration, missing auth on endpoints, and OWASP Top 10
3. **Gap analysis** — verify: all service clients are properly closed in lifespan teardown, all async calls are properly awaited, all exception types are handled separately where behavior differs, graceful degradation works for every optional service
4. **Bug check** — verify: no attribute errors from wrong field names, no silent failures in except blocks that swallow real errors, no race conditions in shared state, no type mismatches between what AI returns and what Pydantic expects
5. **Best practices** — follow: Microsoft Azure SDK best practices (async clients, connection pooling, managed identity), FastAPI best practices (lifespan over on_event, dependency injection, response models), Python best practices (type hints, explicit error chains with `from exc`), OpenTelemetry best practices (spans closed properly, attributes are primitives)
6. **Hackathon awareness** — every change must stay within scope: support the 3 core features (Document Simplifier, Task Decomposer, Focus Mode), serve the 4 judging criteria (Performance, Innovation, Azure Breadth, Responsible AI), and not add complexity that doesn't serve the demo
7. **Show Diego before committing** — explain what was built, how it connects to Azure, a non-biased analysis of improvements, fix those improvements, then show the proposed commit message for approval. Never commit without showing Diego first.

## Current Progress

- Repo restructured into backend/frontend folders (DONE)
- MSAL auth removed, simple X-User-Id user profiles added (DONE)
- Content Safety middleware with cognitive pressure detection (DONE)
- Blob Storage + Document Intelligence upload pipeline (DONE)
- Full backend security and crash bug audit completed (DONE) — 10 issues fixed across all 7 backend files
- Application Insights / Azure Monitor integration (DONE) — monitoring.py, configure_monitoring() called before FastAPI(), 4 custom events tracked (task_decomposed, document_uploaded, session_created, content_safety_flagged), graceful degradation, AIService.close() added and wired into lifespan
- Key Vault integration (DONE) — keyvault.py, patch_settings_from_keyvault() called before any service init in make_app(), DefaultAzureCredential (Managed Identity in prod / az login locally), 10 secrets mapped (OpenAI, Cosmos, Content Safety, Blob, Doc Intelligence, App Insights), model_copy() used to bypass pydantic-settings env var re-resolution, graceful degradation
- Next: App Service deployment, then frontend (Monday with Andy)
- Monday: Team alignment, Foundry evaluation, frontend work begins

## Product Identity

NeuroFocus is NOT three separate tools. It is ONE cohesive AI companion that:
- Knows the user through stored accessibility preferences
- Adapts every interaction to how the user processes information
- Connects document processing → task management → focus execution in one natural flow
- Never asks open-ended questions — always guided choices
- After every output, gently suggests one contextual next step

The AI lives in two places:
1. **Home page** — the AI chat IS the landing page
2. **Side panel** — collapsible chat available on Documents, Tasks, and Focus Mode pages

## Five Pages

1. **AI Home** — Chat-first landing. Guided onboarding for new users. Smart routing for returning users. Time-of-day greeting. "Last time you were working on [X] — want to pick up?"
2. **Documents** — Upload PDF/Word or paste text. Smart preview before processing. AI-decided output format based on user preferences + document type. Output tabs (Simplified / Action Items / Highlights — expandable through prompt engineering). Result caching. AI follow-up suggestions.
3. **My Tasks** — THE core feature. Living interactive checklist. AI responds contextually to completions. Break-down-further on any task. Dependency awareness. Granularity control. This page must be the most polished.
4. **Focus Mode** — Full-screen, one task at a time. Circular timer. Energy check-in. Overwhelm escape hatch ("Everything is too much" → strips to one action). Session summary on exit.
5. **Settings** — All preferences adjustable anytime. Real-time preview of changes.

## Visual Design

Warm and soft by default. The app should feel like a quiet room.
- Background: Cream/warm off-whites (#F7F5F2). Never pure white.
- Accents: Soft sage green (#7BAF8A), muted blue (#5B7FA6), warm terracotta (#D4956A for attention, never red for errors)
- Typography: DM Sans body, DM Serif Display headings
- Corners: Rounded everywhere (14px cards, 8px buttons)
- Shadows: Very gentle, low-opacity
- Spacing: Generous negative space — when in doubt, add more
- Transitions: 0.25s ease on all state changes. Nothing pops or flashes.
- Error states: Warm accent-soft colors, never red. "We're taking a moment" not "ERROR."
- Themes: Warm (default), Dark, High Contrast
- Fonts: DM Sans, OpenDyslexic, Atkinson Hyperlegible
- Adjustable: Line height (1.0-3.0), letter spacing (0-6px)

## Azure Architecture — 8 Services (Deep Integration)

1. **Azure OpenAI (GPT-4o)** — All AI. Potentially orchestrated via Azure AI Foundry (decision pending Monday). Structured JSON output. Low temperature. Streaming SSE.
2. **Azure Cosmos DB (NoSQL)** — Preferences, sessions, cached document results. Change feed for event-driven updates. Serverless. Partition key /user_id.
3. **Azure AI Content Safety** — BUILT. Two-layer system: cognitive pressure regex (7 categories) + Azure Content Safety API. Context-aware screening (user intent vs documents). Flagged responses return calm JSON at 200 status. Logs pre-structured for App Insights.
4. **Azure AI Document Intelligence** — BUILT. prebuilt-read model. Magic byte validation (prevents spoofed file types). Empty text detection. Handles PDF, DOCX, DOC, PNG, JPG, TIFF.
5. **Azure Blob Storage** — BUILT. User-scoped paths ({user_id}/{uuid}/{filename}). Sanitized filenames. Container created once at startup. Archival only — extraction runs from raw bytes.
6. **Azure App Service** — Hosts backend + frontend. Managed identity for Key Vault.
7. **Azure Monitor / App Insights** — BUILT. monitoring.py wraps azure-monitor-opentelemetry. configure_monitoring() bootstraps OTel before FastAPI() so all HTTP + outbound calls (OpenAI, Cosmos) are auto-instrumented. 4 custom events: task_decomposed (granularity, step_count), document_uploaded (page_count, content_type, blob_stored), session_created (step_count), content_safety_flagged (category, path). track_event() uses OTel spans → customEvents in App Insights portal, queryable via KQL. Idempotent — safe to call multiple times. Graceful degradation if APP_INSIGHTS_CONNECTION_STRING not set.
8. **Azure Key Vault** — BUILT. keyvault.py maps 10 secret names (hyphened) to Settings fields (underscored). patch_settings_from_keyvault() called first in make_app() before any service uses credentials. DefaultAzureCredential: uses az login locally, Managed Identity on App Service. model_copy(update=overrides) applies secrets without re-triggering pydantic-settings env var resolution (which would let env vars override Key Vault). Graceful degradation: no KEYVAULT_URL = no-op; individual missing secrets = warning, env var value kept.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/preferences` | Load user preferences |
| PUT | `/api/preferences` | Save user preferences |
| POST | `/api/decompose` | Break goal into time-boxed tasks |
| POST | `/api/summarise` | Streaming text simplification (SSE) |
| POST | `/api/explain` | Explain why text was simplified |
| POST | `/api/nudge` | Supportive nudge when timer overruns |
| POST | `/api/upload` | Upload document → Blob → Doc Intelligence → structured text |
| POST | `/api/analyze` | Full pipeline: upload → simplify + extract tasks in one call |
| POST | `/api/checkin` | Energy check-in → adjust recommendations |
| POST | `/api/sessions` | Save session |
| GET | `/api/sessions` | List past sessions |
| POST | `/api/chat` | AI companion chat (home page + side panel) |

## Backend Structure

```
backend/
├── main.py                  ← FastAPI app, lifespan, CORS, routes
├── config.py                ← Pydantic Settings, Key Vault fallback
├── models.py                ← Request/response schemas
├── db.py                    ← Cosmos DB async repository
├── ai_service.py            ← Azure OpenAI wrapper, all prompts
├── content_safety.py        ← Content Safety middleware + cognitive pressure policy
├── blob_service.py          ← Blob Storage upload
├── doc_intelligence.py      ← Document Intelligence extraction
├── monitoring.py            ← Azure Monitor / Application Insights integration
├── keyvault.py              ← Azure Key Vault secret loading at startup
├── requirements.txt
└── .env.example
```

## Frontend Structure

```
frontend/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx
│   ├── App.jsx              ← Router, layout, AI side panel
│   ├── store.js             ← Redux slices
│   ├── pages/
│   │   ├── Home.jsx         ← AI chat landing page
│   │   ├── Documents.jsx    ← Upload, process, output tabs
│   │   ├── Tasks.jsx        ← Living checklist
│   │   ├── FocusMode.jsx    ← Full-screen focus
│   │   └── Settings.jsx     ← Preferences
│   ├── components/
│   │   ├── Chat.jsx         ← AI chat (used in home + side panel)
│   │   ├── Onboarding.jsx   ← Guided conversational onboarding
│   │   ├── TaskItem.jsx     ← Single task in checklist
│   │   ├── TimerRing.jsx    ← Circular countdown timer
│   │   ├── EnergyCheckin.jsx
│   │   ├── EscapeHatch.jsx
│   │   └── PreferenceDashboard.jsx
│   ├── utils/
│   │   ├── api.js
│   │   └── bionic.jsx
│   └── styles/
│       └── global.css
```

## Responsible AI — Core Design Principles

- ALL AI output: calm, supportive, non-anxiety-inducing
- Content Safety: standard + custom cognitive pressure detection
- NEVER open-ended questions — always guided choices with "type your own" option
- After every output: one gentle contextual suggestion, not a menu
- Error messages: warm tone, never alarming
- Overwhelm escape hatch: safety valve for peak overload
- Explainability: every simplification shows WHY
- User always in control — can exit, adjust, or skip anything

## Key Constraints

- NO Azure AD/MSAL — use simple X-User-Id header
- NO GPT-4-32k — only GPT-4o
- NO gamification (streaks, points, leaderboards) — creates anxiety
- NO open-ended AI questions — always guided choices
- NO red for errors — use warm accent colors
- NO jarring transitions — everything animates smoothly
- Secrets in .env locally, Key Vault in production
- Output modes are prompt-template-driven, not hardcoded — easy to add new ones

## Python Dependencies

```
fastapi
uvicorn[standard]
openai
azure-cosmos
azure-ai-formrecognizer
azure-storage-blob
azure-ai-contentsafety
azure-keyvault-secrets
azure-identity
azure-monitor-opentelemetry
pydantic-settings
python-multipart
httpx
```

## Development

Backend: `cd backend && uvicorn main:app --reload` (port 8000)
Frontend: `cd frontend && npm run dev` (port 5173, proxies /api to 8000)
