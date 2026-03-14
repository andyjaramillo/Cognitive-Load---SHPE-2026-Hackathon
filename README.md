# NeuroFocus — AI Cognitive Support Companion

> *Turns overwhelming into doable.*

A neuro-inclusive AI workspace built for the **Microsoft Innovation Challenge (SHPE 2026 Hackathon)**. NeuroFocus helps users experiencing cognitive overload — especially those with ADHD, autism, dyslexia, or anxiety — by transforming complex information into calm, structured, personalized clarity.

**Stack:** Python 3.11 / FastAPI + React / Tailwind / Framer Motion
**AI:** Azure OpenAI GPT-4o (structured output + streaming SSE)
**Challenge:** Cognitive Load Reduction Assistant

---

## What It Does

| Feature | Description |
|---|---|
| **Document Simplifier** | Upload a PDF/Word doc or paste text → AI rewrites it at your reading level (simple / standard / detailed). Hover any sentence to see *why* it was simplified. Bionic Reading toggle. |
| **Task Decomposer** | Describe a goal → AI breaks it into time-boxed steps with motivational nudges. Granularity control: micro (≤5 min), normal (≤15 min), broad (≤30 min). |
| **Focus Mode** | Full-screen, one task at a time. Circular countdown timer. Supportive check-ins when you're running over. Overwhelm escape hatch that strips everything down to one action. |

All interactions are calm, guided, and never pressuring. The app never guilt-trips, never uses red for errors, and never asks open-ended questions.

---

## Azure Architecture — 8 Services

| # | Service | Role |
|---|---|---|
| 1 | **Azure OpenAI (GPT-4o)** | All AI — task decomposition, text simplification, explainability tooltips, contextual nudges |
| 2 | **Azure Cosmos DB (NoSQL)** | User preferences and session history — serverless, partition key `/user_id` |
| 3 | **Azure AI Content Safety** | Two-layer input/output screening: Azure API + custom cognitive pressure detection (7 categories: urgency, guilt, catastrophizing, perfectionism, shame, comparison, demands) |
| 4 | **Azure AI Document Intelligence** | Extracts text from PDF, Word, and image uploads using the `prebuilt-read` model |
| 5 | **Azure Blob Storage** | Archives uploaded documents under user-scoped paths for auditability |
| 6 | **Azure App Service** | Hosts backend (Python/FastAPI) and frontend (React/Vite) |
| 7 | **Azure Monitor / Application Insights** | Full OpenTelemetry auto-instrumentation + custom events: `task_decomposed`, `document_uploaded`, `session_created`, `content_safety_flagged` |
| 8 | **Azure Key Vault** | Stores all secrets — fetched at startup via `DefaultAzureCredential` (Managed Identity in prod, `az login` locally) |

See [`docs/`](docs/) for the full architecture decision document.

---

## Responsible AI

This is a core judging criterion — not an afterthought.

- **Cognitive pressure detection:** Custom regex layer screens for 7 categories of anxiety-inducing language before and after every AI call. This is beyond what Azure Content Safety provides natively.
- **Context-aware screening:** User-typed text and uploaded documents are screened differently — a textbook that says "you must" isn't flagged the same way a pressuring message would be.
- **Calm error handling:** Every error message is written for neurodiverse users. No HTTP codes, no alarming language. "We're taking a moment" not "500 Internal Server Error."
- **Explainability:** Every simplification shows *why* the sentence was rewritten via a hover tooltip powered by a dedicated AI call.
- **User control:** Exit Focus Mode anytime. Adjust all preferences in real time. Every interaction offers a guided choice, never a blank text box.

---

## Quick Start

### Backend

```bash
cd backend
cp .env.example .env       # fill in your Azure credentials
pip install -r requirements.txt
uvicorn main:app --reload  # runs on port 8000
```

API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### Frontend

```bash
cd frontend
npm install
npm run dev                # runs on port 5173, proxies /api → 8000
```

Open: [http://localhost:5173](http://localhost:5173)

> **No login required.** Auth is handled via a simple `X-User-Id` header (default: `default-user`) so judges can open the app without a Microsoft account.

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in your values. The only required variables to run locally are `AZURE_OPENAI_*` and `COSMOS_*`. All other Azure services (Content Safety, Blob, Doc Intelligence, App Insights, Key Vault) degrade gracefully if not configured.

In production on App Service: set `KEYVAULT_URL` and all secrets are fetched automatically via Managed Identity — no other secrets needed in App Service configuration.

---

## API Reference

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/preferences` | Load user preferences |
| PUT | `/api/preferences` | Save user preferences |
| POST | `/api/decompose` | Break a goal into timed steps |
| POST | `/api/summarise` | Streaming text simplification (SSE) |
| POST | `/api/explain` | Explain why a sentence was simplified |
| POST | `/api/nudge` | Supportive nudge when a timer overruns |
| POST | `/api/upload` | Upload document → extract text via Doc Intelligence |
| POST | `/api/sessions` | Save a decomposed task session |
| GET | `/api/sessions` | List past sessions |

---

## Repo Structure

```
├── backend/           ← FastAPI app, all Azure service integrations
├── frontend/          ← React + Tailwind + Framer Motion
├── infra/             ← Azure Bicep infrastructure templates
├── docs/              ← Product vision, project plan, build logs
└── CLAUDE.md          ← Shared project brain (read this for full context)
```

---

## Team

- **Diego Figueroa** — Backend, Azure integrations, AI prompt engineering
- **Andy Jaramillo** — Frontend, UX, accessibility, React components
