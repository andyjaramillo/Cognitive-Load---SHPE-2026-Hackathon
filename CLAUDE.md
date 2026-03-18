# CLAUDE.md — Pebble. AI Cognitive Support Companion

> "a calm place to start"

---

## ⚡ Quick Start (Read This First)

**This is a teammate handoff document.** If you're picking up where Diego left off, start here.

```bash
# Backend
cd backend && uvicorn main:app --reload        # http://localhost:8000
# Frontend
cd frontend && npm install && npm run dev      # http://localhost:5173 (proxies /api → 8000)
```

The frontend proxies all `/api/*` to `localhost:8000` via `vite.config.js`. You need BOTH servers running.

All API calls use `X-User-Id: diego` header. This is hardcoded in `frontend/src/utils/api.js` (`USER_ID = 'diego'`). For multi-user support later, this would need to come from auth.

Secrets go in `backend/.env` — see `backend/.env.example` for required keys. Never commit `.env`.

---

## Project Overview

Microsoft Innovation Challenge hackathon (March 16–27, 2026). Pebble is an AI cognitive support companion that helps people organize their entire lives — not just work or school, but everything. It transforms overwhelming information into calm, structured, personalized clarity. Built for neurodiverse users and anyone experiencing cognitive overload.

**Challenge:** Cognitive Load Reduction
**Stack:** Python 3.11+ (FastAPI) + JavaScript (React + React Router + Framer Motion + Redux Toolkit)
**Judging Criteria (25% each):** Performance, Innovation, Breadth of Azure services, Responsible AI
**Deadline:** March 27, 2026

---

## Team

- **Diego (Fig)** — primary builder, backend + frontend. Main point of contact.
- **Andy** — limited availability, may help with specific tasks.
- **2 other teammates** — may help with prompts and deliverables later.

All code should be calibrated for solo-builder reality. Efficiency matters, never at the cost of quality.

---

## Build Status — Current State (as of Session 5, March 18 2026)

### What's FULLY BUILT AND WORKING

| Component | Status | Notes |
|-----------|--------|-------|
| Backend FastAPI app | ✅ Complete | All routes working |
| `/api/preferences` GET + PUT | ✅ Working | Cosmos DB backed |
| `/api/decompose` POST | ✅ Working | GPT-4o, breaks goals into tasks |
| `/api/summarise` POST (SSE) | ✅ Working | Streaming, Content Safety screened |
| `/api/explain` POST | ✅ Working | Sentence-level explanation |
| `/api/nudge` POST | ✅ Working | Supportive task nudge |
| `/api/upload` POST | ✅ Working | Doc Intelligence + Blob Storage |
| `/api/sessions` GET + POST | ✅ Working | Cosmos DB backed |
| `/api/chat` POST (SSE) | ✅ Working | Full 12-block prompt, streaming, actions |
| `/api/tasks` GET + POST | ✅ Working | Cosmos DB backed, full CRUD |
| TopNav | ✅ Complete | Pebble brand, 4 nav pills, settings gear |
| Redux store | ✅ Complete | prefs, tasks, summarise slices |
| `api.js` utilities | ✅ Complete | chatStream, saveTasks, loadTasks, all endpoints |
| App.jsx | ✅ Complete | Loading gate, onboarding gate, theme system |
| Onboarding flow | ✅ Complete | 11-stage state machine, saves to Cosmos |
| Home page (chat) | ✅ Complete | SSE streaming, quick actions, AI greeting |
| Documents page | ✅ Working | Upload, processing, results (see gaps below) |
| Tasks page | ✅ Working | Accordion groups, task actions (see gaps below) |
| FocusMode page | ✅ Working | Full screen, circular timer, 6 states |
| Settings page | ⚠️ Stub | Basic layout, not wired to preferences yet |
| `global.css` themes | ✅ Complete | 4 time-of-day themes, all design tokens |

### What's MISSING / NOT YET BUILT

| Feature | Priority | Where to Build | Spec Reference |
|---------|----------|---------------|----------------|
| Post-onboarding walkthrough | 🔴 High | `Home.jsx` + new `WalkthroughOverlay.jsx` | SESSION5_PART3_COMPLETE.md §5 |
| Settings page full UI | 🔴 High | `Settings.jsx` | Session 6 (not yet started) |
| Chat history load on reload | 🟡 Medium | `Home.jsx` `useEffect` → `GET /api/conversations` | SESSION5_PART3_COMPLETE.md |
| Tasks ↔ Cosmos sync | 🟡 Medium | `Tasks.jsx` mount + state change | `api.js` `loadTasks`/`saveTasks` ready |
| Documents saved doc cards | 🟡 Medium | `Documents.jsx` lower section | SESSION2_PROMPT.md |
| `GET /api/conversations` endpoint | 🟡 Medium | `backend/main.py` | SESSION5_PART3_COMPLETE.md |
| `GET /api/documents` endpoint | 🟡 Medium | `backend/main.py` | SESSION5_PART3_COMPLETE.md |
| Focus Mode → chat routing | 🟢 Lower | `FocusMode.jsx` → Redux state | SESSION4_FINAL.md |
| Pebble dot avatar on chat bubbles | 🟢 Lower | `Home.jsx` AiBubble component | SESSION5_GAPS.md |
| App Service deployment | 🟢 Lower | Azure portal + GitHub Actions | — |

---

## Known Issues / Bugs (from Diego's testing session, March 18)

1. **Settings page is a stub** — clicking Settings goes to a mostly empty page. Full preferences UI hasn't been built yet. All preferences ARE saved correctly via onboarding; the Settings page just can't edit them yet.

2. **Chat history doesn't reload on refresh** — conversation is lost on page refresh because `GET /api/conversations` endpoint doesn't exist yet in the backend, and Home.jsx doesn't call it on mount. Each page load starts fresh with just the greeting.

3. **Tasks not persisted to Cosmos** — `loadTasks()` and `saveTasks()` utilities exist in `api.js` but Tasks.jsx doesn't call them. Tasks disappear on refresh. The backend `/api/tasks` GET + POST exist and work — just need wiring.

4. **Documents page missing "Your documents" section** — uploaded documents are saved to Cosmos/Blob Storage but there's no UI to browse previously uploaded docs. The upload + processing flow works.

5. **Walkthrough not built** — after onboarding completes, there's supposed to be a 5-step teal glow tour of the nav. `walkthroughComplete` preference is tracked in Redux/Cosmos but the `WalkthroughOverlay.jsx` component hasn't been built.

6. **Font choices in onboarding use Google Fonts not loaded** — Lexend, Atkinson Hyperlegible, OpenDyslexic are referenced in the onboarding font picker but not loaded in `index.html`. The font preview in onboarding Q3 will fall back to sans-serif. Add the font links to fix.

---

## Architecture Decisions (important context)

### SSE Streaming Pattern (`/api/chat`)
The chat endpoint returns `text/event-stream`. Event types:
- `{type:"token", content:"..."}` — streamed text chunk, accumulate in `streamingContent`
- `{type:"replace", content:"..."}` — replace accumulated text (output safety triggered); push directly as final message
- `{type:"actions", buttons:[...]}` — routing buttons appended below message
- `{type:"done"}` — stream complete

`###ACTIONS[{...}]###` is appended by GPT-4o in its response; `chat_service.py` strips it via regex and emits it as the `actions` event. The frontend never sees the raw marker.

### Chat State (local, not Redux)
Chat messages live in `Home.jsx` local state (`useState`), NOT in Redux. This was a deliberate choice — Redux slices were getting too heavy and chat is page-local. Only task groups and prefs are in Redux (shared across pages).

### `replaced` flag pattern in `sendMessage`
`let replaced = false` is a local variable inside the async function (not React state) to avoid stale closure issues when `onReplace` fires mid-stream.

### CSS Scroll Chain Fix
`app-shell` must have `height: 100vh; overflow: hidden` and `main-content` must have `overflow: hidden; min-height: 0` for Home's internal flex scroll to work. If you change `global.css` here, Documents and Tasks pages need their own `overflowY: auto` scroll wrapper — both already have this.

### Onboarding AnimatePresence Pattern
The 11-stage onboarding uses a `renderContent()` switch inside a single `<motion.div key={stage}>` wrapper. The `key={stage}` is critical — it forces React to unmount/remount on every stage change, which is what makes AnimatePresence exit animations fire correctly. Don't change this to a `<Shell stageKey={stage}>` component approach — that breaks exit animations.

### User ID
All API calls use `X-User-Id: diego` header (hardcoded in `frontend/src/utils/api.js`). The backend extracts this in `get_user_id()` dependency. For the hackathon demo this is fine. Real auth would replace this.

### Field Mapping (frontend ↔ backend)
Tasks have different field names in Redux vs Cosmos:
- `group.name` (frontend) ↔ `group_name` (backend)
- `task.motivation_nudge` (frontend) ↔ `task.description` (backend)
- `task.done/paused` booleans (frontend) ↔ `task.status: 'done'|'in_progress'|'pending'` (backend)

The `_toBackendGroup` and `_toFrontendGroup` helpers in `api.js` handle this mapping.

---

## Brand Identity — Pebble.

- **Name:** "Pebble" with a period — the period is part of the brand
- **Logo font:** DM Serif Display (loaded via Google Fonts in `index.html`)
- **The dot:** Ocean sage #5A8A80 — 8px circle at baseline after "Pebble" text
- **Night mode dot:** White #DCD4DA
- **Subtitle:** "a calm place to start" — Inter Light 300, #7A7670, letter-spacing 1px. **Hero/onboarding only. NEVER in nav.**
- **Avatar:** Ocean sage dot (8px circle, #5A8A80). **NEVER a letter avatar.**
- **Internal codename:** neurofocus (folder names, Azure resource names stay as-is)

---

## Color Meaning System (STRICT — Never Deviate)

See `color_system.md` for full hex values across all 4 themes.

| Color | CSS Variable | Meaning | Use |
|-------|-------------|---------|-----|
| Green | `--color-done` | Completion / safety | "You did it. This is done." |
| Teal | `--color-active` | Active / primary actions | "Click me." |
| Sky blue | `--color-queued` | Upcoming / queued | "Waiting. No rush." |
| Lilac | `--color-paused` | Paused / reflective | "Resting. No judgment." |
| Soft orange | `--color-ai` | AI companion voice | "Pebble is talking to you." NEVER on status |
| Warm gray | — | Inactive / unfilled | Default neutral |

**Never use:** red, bright yellow, pure black backgrounds, pure white backgrounds, neon, salmon/coral on status indicators.

---

## Four Time-of-Day Themes

Auto-detected by hour in `App.jsx`, applied via `data-time-theme` attribute on `<html>`. User can override in Settings (not yet built).

- **Morning (6am–12pm):** Peach sunrise
- **Afternoon (12pm–5pm):** Warm coast — DEFAULT
- **Evening (5pm–9pm):** Warm dusk
- **Night (9pm–6am):** Deep ocean

Color theme override (user-selected) applied via `data-theme` attribute. `calm` = let time-of-day show through (remove `data-theme`).

---

## Five Pages

### Page 1: Home — Full-Screen AI Chat (`/` or `/home`)
**Status: ✅ Built.** Gaps: chat history reload, walkthrough.

- New users → full-screen `Onboarding.jsx` (rendered by `App.jsx` before nav shows)
- Returning users → AI greeting fires on mount, 3 quick action pills, "What was I working on?" lilac button
- Chat: SSE streaming via `chatStream()`, persisted messages in local state, streaming bubble with pulse dots
- Quick actions disappear after first user message (`hasUserMessages` flag)
- Spec: `SESSION5_PROGRESS.md`, `SESSION5_PART3_COMPLETE.md`

### Page 2: Documents — Conversational Doc Processing (`/documents`)
**Status: ✅ Working with gaps.** Missing: saved documents browser.

- Three states: Input (upload zone + breathing animation) → AI question (4 guided choices) → Results (conversation)
- "Turn into tasks" → dispatches to Redux `taskGroups` → navigates to `/tasks`
- Doc memory saves to Cosmos DB
- Spec: `SESSION2_PROMPT.md`

### Page 3: Tasks — Living Checklist (`/tasks`)
**Status: ✅ Working with gaps.** Missing: Cosmos sync on mount/change.

- Accordion groups (one open at a time), waterfall inside groups
- Three-level interaction depth, smart input (simple vs AI decomposition)
- "I have ___ minutes" filter, per-task AI nudges
- Shared Redux `tasks.groups` state — also written by Home chat and Documents page
- Spec: `TASKS_SPEC.md`

### Page 4: Focus Mode — Full Screen (`/focus`)
**Status: ✅ Working.** App.jsx hides TopNav entirely for this route.

- Circular timer, energy check-in, overwhelm escape hatch
- Timer colors: green → teal → warm amber (NEVER red)
- Session summary on exit
- Spec: `SESSION4_FINAL.md` (561 lines, 6 states)

### Page 5: Settings (`/settings`)
**Status: ⚠️ Stub only.** Full UI is Session 6 work.

- Will show: all preferences adjustable with live preview, "What Pebble has learned", reduce motion toggle
- Spec: to be designed in Session 6

---

## Onboarding Flow (`Onboarding.jsx`)

11-stage state machine: `welcome → name → confirm-name → meet → q2 → q3 → q4 → q5 → q6 → complete → final`

| Stage | Content |
|-------|---------|
| `welcome` | Full-screen hero — "Pebble." logo + "a calm place to start" + "Let's begin" button |
| `name` | "What should I call you?" — text input |
| `confirm-name` | "Nice to meet you, [name]" — confirm or re-enter |
| `meet` | "Here's what I can help with" — 3 life areas intro |
| `q2` | Communication style — 4 choice cards (Calm/Direct/Warm/Adaptive) |
| `q3` | Font preference — 4 font cards with live preview |
| `q4` | Theme preference — 5 theme cards with live preview |
| `q5` | Reading level — 4 choice cards |
| `q6` | Granularity — 4 choice cards (how much detail in tasks) |
| `complete` | Saving animation + "Pebble is ready" message |
| `final` | Transition — sets `onboardingComplete: true` in Cosmos + Redux, App.jsx automatically shows main app |

On save: calls `savePreferences()` → dispatches `prefsActions.setPrefs({ ..., onboardingComplete: true })` → App.jsx gate unlocks automatically.

---

## API Endpoints — Actual Backend Status

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/health` | Health check | ✅ Working |
| GET | `/api/preferences` | Load user preferences | ✅ Working |
| PUT | `/api/preferences` | Save user preferences | ✅ Working |
| POST | `/api/decompose` | Break goal into tasks (GPT-4o) | ✅ Working |
| POST | `/api/summarise` | Simplify text (SSE stream) | ✅ Working |
| POST | `/api/explain` | Explain a sentence | ✅ Working |
| POST | `/api/nudge` | Supportive task nudge | ✅ Working |
| POST | `/api/upload` | Upload document (Doc Intelligence + Blob) | ✅ Working |
| POST | `/api/sessions` | Save focus session | ✅ Working |
| GET | `/api/sessions` | List focus sessions | ✅ Working |
| POST | `/api/chat` | AI companion chat (SSE stream, 12-block prompt) | ✅ Working |
| GET | `/api/tasks` | Load task groups from Cosmos | ✅ Working |
| POST | `/api/tasks` | Save task groups to Cosmos | ✅ Working |
| GET | `/api/conversations` | Load chat history | ❌ Not built yet |
| GET | `/api/documents` | List user's documents | ❌ Not built yet |

---

## Azure Services (8 integrated)

1. **Azure OpenAI** (GPT-4o) — all AI generation, assembled via `ai_service.py` + `chat_service.py`
2. **Azure Cosmos DB** (serverless, NoSQL) — preferences, sessions, documents, conversations, user_memory, learned_patterns, tasks
3. **Azure Blob Storage** — document archival after upload
4. **Azure AI Document Intelligence** — PDF/Word text extraction
5. **Azure AI Content Safety** — input screening (before GPT call) + output screening (after stream, via `replace` event)
6. **Azure Monitor / Application Insights** — observability, telemetry in `monitoring.py`
7. **Azure Key Vault** — secrets management, accessed via `keyvault.py`
8. **Azure App Service** — deployment target (not yet deployed to Azure)

---

## Backend File Structure

```
backend/
├── main.py              ← FastAPI app + all route handlers
├── config.py            ← Settings (env vars + Key Vault fallback)
├── models.py            ← Pydantic request/response schemas
├── db.py                ← Cosmos DB async repository
├── ai_service.py        ← Azure OpenAI wrapper (decompose, summarise, explain, nudge)
├── chat_service.py      ← Chat logic: 12-block system prompt, SSE streaming, ###ACTIONS### parsing
├── content_safety.py    ← Azure Content Safety + cognitive pressure regex
├── blob_service.py      ← Azure Blob Storage upload
├── doc_intelligence.py  ← Azure Document Intelligence extraction
├── keyvault.py          ← Azure Key Vault client
├── monitoring.py        ← Application Insights telemetry
├── requirements.txt     ← Python dependencies
└── .env.example         ← Required environment variables template
```

---

## Frontend File Structure

```
frontend/
├── index.html           ← Title "Pebble.", DM Serif Display font, meta tags
├── package.json
├── vite.config.js       ← Proxies /api → localhost:8000
└── src/
    ├── main.jsx         ← React entry, BrowserRouter, Redux Provider
    ├── App.jsx          ← Routes, time-of-day theme, loading gate, onboarding gate
    ├── store.js         ← Redux: prefsSlice, tasksSlice, summariseSlice
    ├── components/
    │   ├── TopNav.jsx             ← "Pebble●" logo + 4 nav pills + settings gear
    │   ├── WalkthroughOverlay.jsx ← TODO: 5-step tour with teal glow (not yet built)
    │   ├── Decomposer.jsx         ← Task decomposition widget (used in Tasks page)
    │   ├── Refactor.jsx           ← Text simplification widget (used in Documents page)
    │   ├── PreferenceDashboard.jsx← Preferences widget (adapt for Settings page)
    │   ├── TimerRing.jsx          ← Circular timer (used in FocusMode page)
    │   └── Sidebar.jsx            ← OLD — not used, left in codebase, can be deleted
    ├── pages/
    │   ├── Home.jsx         ← Full chat (SSE), quick actions, greeting on mount
    │   ├── Onboarding.jsx   ← 11-stage onboarding state machine
    │   ├── Documents.jsx    ← Upload + 3-state processing flow
    │   ├── Tasks.jsx        ← Living checklist with task groups
    │   ├── FocusMode.jsx    ← Full-screen focus timer
    │   └── Settings.jsx     ← STUB — needs full build in Session 6
    ├── utils/
    │   ├── api.js           ← All API helpers + chatStream SSE parser
    │   └── bionic.jsx       ← Bionic Reading word-bolding utility
    └── styles/
        └── global.css       ← All CSS: 4 themes, design tokens, .btn, .app-shell, etc.
```

---

## Redux Store — Actual Shape (as built)

```javascript
// store.js

// prefs slice
{
  name:               'there',       // user's name from onboarding
  communicationStyle: 'balanced',    // calm | direct | warm | adaptive | balanced
  onboardingComplete: false,         // gates App.jsx — shows Onboarding if false
  walkthroughComplete: false,        // gates walkthrough overlay
  readingLevel:       'standard',    // simplified | standard | detailed | expert
  fontChoice:         'default',     // default | lexend | atkinson | opendyslexic
  bionicReading:      false,
  lineHeight:         1.6,
  letterSpacing:      0,
  timerLengthMinutes: 25,
  focusMode:          false,
  granularity:        'normal',      // minimal | normal | detailed | ultra
  colorTheme:         'calm',        // calm | morning | afternoon | evening | night
  loaded:             false,         // true after fetchPreferences() resolves
}

// tasks slice
{
  groups: [
    {
      id:         string,            // generated: Math.random().toString(36).slice(2,10)
      name:       string,            // display name (maps to group_name in Cosmos)
      source:     'manual'|'ai'|'document',
      created_at: string,
      tasks: [
        {
          id:               string,
          task_name:        string,
          duration_minutes: number,
          motivation_nudge: string,  // maps to 'description' in Cosmos
          due_date:         string|null,
          due_label:        string|null,
          done:             boolean,  // maps to status='done' in Cosmos
          paused:           boolean,  // maps to status='in_progress' in Cosmos
          timerStarted:     number|null,
          nudgeText:        string|null,
        }
      ]
    }
  ],
  focusGroupId: string|null,
  focusTaskId:  string|null,
  loading:      boolean,
  error:        string|null,
}

// summarise slice (used by Documents page streaming)
{
  output:    string,
  streaming: boolean,
  error:     string|null,
}
```

---

## Transitions and Animations

### Page transitions (Framer Motion AnimatePresence mode="wait")
- Out: `{ opacity: 0, y: -12, transition: { duration: 0.4, ease: [0.4,0,0.2,1] } }`
- In: `initial: { opacity: 0, y: 16 }` → `animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.4,0,0.2,1] } }`

### Staggered element reveal
- Elements: `initial: {opacity:0, y:8}` → `animate: {opacity:1, y:0, transition:{duration:0.4, ease:'ease'}}`
- Delay: `0.05 + index * 0.1` seconds per item

### Loading indicator
- Ocean sage dot (8px), `animate: {scale: [0.85, 1.15, 0.85], opacity: [0.4, 1, 0.4]}`, `transition: {duration: 2.2, repeat: Infinity, ease: 'easeInOut'}`

### Breathing animation (upload zone)
- `box-shadow` pulse: `0 0 0 0px rgba(42,122,144,0.04)` → `0 0 0 12px rgba(42,122,144,0.02)`, 4s ease-in-out infinite

### General rules
- All hover/focus transitions: `0.25s ease`
- Border radius: 14px cards, 12px inputs, 8px buttons
- Never red. Never spinning loaders. Everything breathes.
- Respect `prefers-reduced-motion`: instant transitions

---

## AI Personality (Pebble)

Full spec in `PEBBLE_PERSONALITY.md` (1,652 lines). Key points:

- **Layer 1:** Identity, 7 nevers, 6 always behaviors, emotional spectrum
- **Layer 2:** 12-block dynamic system prompt assembled per `/api/chat` call in `chat_service.py`:
  - Block 1: Pebble identity
  - Block 2: User prefs (name, style, granularity, reading level)
  - Block 3: Long-term memories from Cosmos
  - Block 4: Learned patterns
  - Block 5: Time context (time of day, day of week)
  - Block 6: Emotional/cognitive signals (detected from message)
  - Block 7: Recent conversation history (last 20 turns)
  - Block 8: Document summaries (if relevant)
  - Block 9: Current task context
  - Block 10: Current page context
  - Block 11: Safety instructions (adjusted by content safety tier)
  - Block 12: Response format + `###ACTIONS[...]###` instruction
- **Layer 3:** 3-tier content safety — severity 5–6 = hard block (no GPT call), 3–4 = soft flag (extra care Block 11), cognitive pressure regex = behavior signal
- **Layer 4:** Scope — entire life organizer (moving, studying, layoffs, insurance, events, bureaucracy)
- **Layer 5:** Adaptive learning — 3 types, pattern detection, user transparency

---

## Detailed Specification Documents

| File | Contents |
|------|----------|
| `PEBBLE_PERSONALITY.md` | Full AI personality — 5 layers, system prompt construction, voice guide, content safety |
| `SESSION5_PROGRESS.md` | Home page layout + all 6 onboarding questions + returning user view |
| `SESSION5_PART3_COMPLETE.md` | Chat routing, document memory, walkthrough 5-step spec, error handling |
| `SESSION5_GAPS.md` | Animation specs, chat styling, backend endpoint spec, Redux shape, known gaps |
| `TASKS_SPEC.md` | Complete Tasks page specification — all interaction depths, filter, nudges |
| `SESSION2_PROMPT.md` | Complete Documents page specification — 3 states, guided choices, results |
| `SESSION4_FINAL.md` | Complete Focus Mode specification — 6 states (561 lines) |
| `color_system.md` | Full color system — all hex values across 4 time-of-day themes |

---

## Standing Code Quality Rules

Before committing or pushing ANY code:

1. Triple-check all code — read every modified file end-to-end
2. Security audit — injection flaws, exposed secrets, input validation
3. Gap analysis — service clients closed, async calls awaited, graceful degradation
4. Bug check — no attribute errors, silent failures, race conditions, type mismatches
5. Best practices — Azure SDK, FastAPI, React hooks/cleanup/key props, Python type hints
6. Hackathon awareness — every change must serve a judging criterion
7. Show Diego before committing — explain what was built, propose commit message
8. Never cut corners — polished > fast

---

## Key Constraints (Never Violate)

- NO sidebar — top nav only
- NO red anywhere — warm accent colors only
- NO pure white or pure black backgrounds
- NO tabs on document results — conversational flow only
- NO gamification — no streaks, points, leaderboards
- NO spinning loaders — gentle pulsing dots only
- Home page is ONLY chat — no embedded task lists or document viewers
- Every error message sounds like Pebble talking, never technical jargon
- Frontend must check EVERY API response for `{flagged: true}`
- Respect `prefers-reduced-motion` throughout
- Existing components (`Decomposer`, `Refactor`, `TimerRing`) should be ADAPTED, not rebuilt from scratch
- `Sidebar.jsx` is dead code — not used anywhere, safe to delete

---

## How to Reset Onboarding (Testing)

To test onboarding as a new user:

```bash
curl -X PUT http://localhost:8000/api/preferences \
  -H "Content-Type: application/json" \
  -H "X-User-Id: diego" \
  -d '{"onboarding_complete": false}'
```

Then refresh the frontend — you'll see the full onboarding flow.

---

## Development

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in Azure credentials
uvicorn main:app --reload  # http://localhost:8000

# Frontend
cd frontend
npm install
npm run dev  # http://localhost:5173
```

API docs available at `http://localhost:8000/docs` (Swagger UI) when backend is running.
