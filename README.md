# Pebble. — a calm place to start

> AI cognitive support companion that transforms overwhelming information into calm, structured, personalized clarity.

Built for the **Microsoft Innovation Challenge — SHPE 2026 Hackathon** (March 16–27, 2026).
Challenge category: **Cognitive Load Reduction**

---

## The Problem

Cognitive overload is a daily reality for millions of people — especially those with ADHD, autism, dyslexia, anxiety, or anyone navigating a high-stress period. Existing productivity tools were built for neurotypical workflows: they add structure by demanding more decisions. Pebble takes the opposite approach. Instead of asking "what do you want to do?", it asks "what's on your mind?" — and handles the rest.

---

## What Pebble Does

| Feature | Description |
|---------|-------------|
| **AI Companion Chat** | A persistent companion that knows your preferences, your documents, and your tasks. Powered by a 12-block dynamic system prompt — every response is personalized to your reading level, communication style, and context. |
| **Document Simplifier** | Upload a PDF, Word doc, or paste text. Pebble extracts, screens, and rewrites it at your reading level. Hover any sentence for an AI-generated explanation of why it was simplified. |
| **Task Decomposer** | Describe a goal. Pebble breaks it into time-boxed steps with gentle motivational nudges. Granularity control: micro (5 min), normal (15 min), broad (30 min). |
| **Focus Mode** | Full-screen, one task at a time. Circular breathing timer. Energy check-ins. An escape hatch that strips everything down to one action when things feel too heavy. |
| **Living Task List** | Tasks created from chat, documents, or manually — all synced to Cosmos DB and available across pages. Drag to reorder. Break down any task into smaller steps inline. |
| **Personalized Onboarding** | 11-stage onboarding sets communication style, reading level, font choice, and visual theme — all of which shape every subsequent AI response. |

---

## Azure Architecture — 8 Services

| # | Service | How It's Used |
|---|---------|---------------|
| 1 | **Azure OpenAI (GPT-4o)** | All AI generation — chat companion (streaming SSE), task decomposition, document simplification, contextual nudges, session title generation |
| 2 | **Azure Cosmos DB (NoSQL, serverless)** | Stores user preferences, task groups, chat history, uploaded documents, focus sessions, user memories, and learned behavioral patterns — all partitioned by `/user_id` |
| 3 | **Azure AI Content Safety** | Two-layer input/output screening: Azure API (Hate/SelfHarm/Sexual/Violence) + custom cognitive pressure detection (7 categories: urgency, guilt, catastrophizing, perfectionism, shame, comparison, overwhelm) |
| 4 | **Azure AI Document Intelligence** | Extracts text from PDF, Word, and image uploads using the `prebuilt-read` model with magic-byte file validation |
| 5 | **Azure Blob Storage** | Archives uploaded documents under user-scoped paths (`{user_id}/{uuid}/{filename}`) for audit and retrieval |
| 6 | **Azure App Service** | Hosts the unified app — Python/FastAPI backend serves the React frontend's static build from a single URL |
| 7 | **Azure Monitor / Application Insights** | Full OpenTelemetry auto-instrumentation + custom events: `task_decomposed`, `document_uploaded`, `session_created`, `content_safety_flagged`, `safety_hard_block`, `cognitive_pressure_detected` |
| 8 | **Azure Key Vault** | Stores all secrets — fetched at startup via `DefaultAzureCredential` (Managed Identity on App Service, `az login` locally) |

---

## Responsible AI

- **Custom cognitive pressure detection:** Seven regex-based categories screen for anxiety-inducing language before and after every AI call — patterns that Azure Content Safety's standard categories don't cover (urgency framing, guilt triggers, perfectionism demands).
- **Context-aware screening:** Uploaded documents and user-typed messages are screened differently. "You must submit by Friday" in a syllabus is not the same signal as in a chat message.
- **Two-tier response:** Severity 5-6 content never reaches GPT-4o (pre-written calm response returned). Severity 3-4 triggers extra care in the system prompt's safety block without blocking the user.
- **Calm error handling:** Every error message is written in Pebble's voice for neurodiverse users. No HTTP codes, no alarming language.
- **User control:** Every interaction offers a guided choice. Adjust all preferences live in Settings. Exit any mode anytime.

---

## Tech Stack

**Backend:** Python 3.11, FastAPI, Pydantic v2, `azure-cosmos`, `azure-ai-formrecognizer`, `azure-storage-blob`, `azure-ai-contentsafety`, `azure-monitor-opentelemetry`, `azure-keyvault-secrets`

**Frontend:** React 18, React Router v7, Redux Toolkit, Framer Motion, `@dnd-kit` (drag-to-reorder), Vite

**Fonts:** DM Serif Display (headings), DM Sans (body), Lexend, Atkinson Hyperlegible, OpenDyslexic (user-selectable)

---

## Getting Started (Local)

### Prerequisites
- Python 3.11+
- Node.js 20+
- Azure account with the services above provisioned

### Backend

```bash
cd backend
cp .env.example .env       # fill in your Azure credentials
pip install -r requirements.txt
uvicorn main:app --reload  # http://localhost:8000
```

API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### Frontend

```bash
cd frontend
npm install
npm run dev                # http://localhost:5173, proxies /api -> 8000
```

### Production build (single URL)

```bash
./build.sh        # builds frontend, copies dist/ to backend/static/
./startup.sh      # starts gunicorn serving both API + frontend
```

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in your values. The only required variables to run locally are `AZURE_OPENAI_*` and `COSMOS_*`. All other Azure services degrade gracefully if not configured.

| Variable | Required | Secret | Description |
|----------|----------|--------|-------------|
| `AZURE_OPENAI_ENDPOINT` | Yes | Yes | Azure OpenAI resource endpoint |
| `AZURE_OPENAI_API_KEY` | Yes | Yes | Azure OpenAI API key |
| `AZURE_OPENAI_DEPLOYMENT` | No | No | Model deployment name (default: `gpt-4o`) |
| `AZURE_OPENAI_API_VERSION` | No | No | API version (default: `2024-02-01`) |
| `COSMOS_ENDPOINT` | Yes | Yes | Cosmos DB account endpoint |
| `COSMOS_KEY` | Yes | Yes | Cosmos DB primary key |
| `COSMOS_DATABASE` | No | No | Database name (default: `neurofocus`) |
| `CONTENT_SAFETY_ENDPOINT` | No | Yes | Azure Content Safety endpoint |
| `CONTENT_SAFETY_KEY` | No | Yes | Azure Content Safety key |
| `BLOB_CONNECTION_STRING` | No | Yes | Azure Storage connection string |
| `DOC_INTELLIGENCE_ENDPOINT` | No | Yes | Document Intelligence endpoint |
| `DOC_INTELLIGENCE_KEY` | No | Yes | Document Intelligence key |
| `APP_INSIGHTS_CONNECTION_STRING` | No | Yes | Application Insights connection string |
| `KEYVAULT_URL` | No | No | Key Vault URL — enables Managed Identity secret fetch |
| `ALLOWED_ORIGINS` | No | No | Comma-separated CORS origins (default: `http://localhost:5173`) |
| `PORT` | No | No | Server port — set automatically by Azure App Service |

In production on App Service: set `KEYVAULT_URL` and grant the App Service Managed Identity `Key Vault Secrets User` role — all other secrets are fetched automatically.

---

## Team

- **Diego Figueroa** — Architecture, Azure integrations, AI systems, frontend, UI/UX
- **Andy Jaramillo** — Support
- **Gabe** — Prompt engineering
- **David** — Documents page

---

## Built for the Microsoft Innovation Challenge 2026

Judging criteria: Performance · Innovation · Breadth of Azure services · Responsible AI
