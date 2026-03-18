# CLAUDE.md — Pebble. AI Cognitive Support Companion

> "a calm place to start"

## Project Overview

Microsoft Innovation Challenge hackathon (March 16-27, 2026). Pebble is an AI cognitive support companion that helps people organize their entire lives — not just work or school, but everything. It transforms overwhelming information into calm, structured, personalized clarity. Built for neurodiverse users and anyone experiencing cognitive overload.

**Challenge:** Cognitive Load Reduction
**Stack:** Python 3.11+ (FastAPI) backend + JavaScript (React + React Router + Framer Motion) frontend
**Judging Criteria (25% each):** Performance, Innovation, Breadth of Azure services, Responsible AI

## Team Reality

Diego (Fig) is the primary builder handling backend AND frontend. Andy has limited availability. Two other teammates may help with prompts and deliverables later. All code should be calibrated for a solo-builder reality. Efficiency matters but never at the cost of quality.

## Brand Identity — Pebble.

- **Name:** "Pebble" with a period — the period is part of the brand
- **Logo font:** DM Serif Display, color #1A1A1A
- **The dot:** Ocean sage #5A8A80, a circle element at baseline after the text
- **Night mode:** White dot #DCD4DA, light text #DCD4DA
- **Subtitle (hero only, NOT in nav):** "a calm place to start" — Inter Light 300, color #7A7670, letter-spacing 1px
- **Nav shows:** Just "Pebble●" — no subtitle
- **Avatar:** Ocean sage dot (8px circle, #5A8A80). NEVER a letter avatar.
- **Internal codename:** neurofocus (folder names, Azure resources stay as-is, only user-facing display changes)

Load DM Serif Display from Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap" rel="stylesheet">
```

## Standing Code Quality Rules

Before committing or pushing ANY code, Claude must:

1. Triple-check all code — read every file modified and verify correctness end-to-end
2. Security audit — check for injection flaws, exposed secrets, missing input validation
3. Gap analysis — verify all service clients properly closed, all async calls awaited, graceful degradation works
4. Bug check — no attribute errors, no silent failures, no race conditions, no type mismatches
5. Best practices — Microsoft Azure SDK, FastAPI, React (hooks, cleanup, key props), Python (type hints, error chains)
6. Hackathon awareness — every change must serve the judging criteria
7. Show Diego before committing — explain what was built, non-biased analysis, proposed commit message
8. Never cut corners on quality — if the polished version is better, build the polished version

## Product Identity

Pebble is a life organizer powered by a calm AI companion. It helps with EVERYTHING — moving apartments, studying for exams, managing a layoff, dealing with insurance, planning events, handling bureaucracy. If it's overwhelming and can be broken down, Pebble helps.

The AI (named Pebble) has a full personality defined in PEBBLE_PERSONALITY.md — 5 layers covering identity, system prompt construction, voice, content safety, scope/boundaries, and adaptive learning. Read that document for the complete AI behavior spec.

Pebble connects: document processing → task management → focus execution in one natural flow. The AI lives everywhere — it IS the experience. Not a sidebar tool.

## Navigation — Minimal Top Bar (Style B)

NO sidebar. NO left panel. Clean minimal top bar:
- Left: "Pebble●" logo text (DM Serif Display + ocean sage dot)
- Center-right: 4 nav items as small rounded pills: Home, Documents, Tasks, Focus
- Far right: Settings gear icon
- Active nav item: teal-tinted background rgba(42,122,144,0.1)
- Inactive items: secondary text color
- Focus Mode route hides the ENTIRE top bar — full screen
- Height: ~52px, subtle bottom border
- Button border-radius: 8px everywhere

## Five Pages

### Page 1: Home (Full-Screen AI Chat)
Route: / or /home — the app ALWAYS opens here
- **New users:** Conversational onboarding — 6 guided questions, one at a time, UI adapts live. See SESSION5_PROGRESS.md for all 6 questions and SESSION5_GAPS.md for animation specs.
- **Returning users:** AI-generated contextual greeting + 3 quick action buttons + "what was I working on?" lilac link + chat input. See SESSION5_PROGRESS.md Part 1.
- **Chat:** Full /api/chat integration with SSE streaming, inline task creation, routing to other pages via buttons. See SESSION5_PART3_COMPLETE.md.
- **Post-onboarding walkthrough:** 5-step tour with teal glow highlights on nav items. See SESSION5_PART3_COMPLETE.md Section 5.
- **Home is ONLY chat.** No embedded task lists, no document viewers. Clean, centered, calm.

### Page 2: Documents (Conversational Document Processing)
Route: /documents — See SESSION2_PROMPT.md for full spec
Three states: Input → AI guided question → Conversational results
- Upload zone with breathing animation
- 4 guided choices (teal/green/sky blue/lilac dots)
- Results as conversation, not tabs
- "Turn into tasks" flows to Tasks page via shared Redux state
- Document memory persists in Cosmos DB across sessions
- Pebble avatar: ocean sage dot (not letter "N")

### Page 3: Tasks (Living Checklist — MOST POLISHED PAGE)
Route: /tasks — See TASKS_SPEC.md for full spec
- Collapsed task groups (accordion, one open at a time)
- Waterfall view inside groups (one active task expanded)
- Three-level interaction depth (nothing → break down + more → full menu)
- Smart input: simple tasks add directly, complex goals trigger AI decomposition
- "I have ___ minutes" filter
- Per-task AI nudges
- Shared Redux `taskGroups` state (also written to by Home chat and Documents page)

### Page 4: Focus Mode
Route: /focus — See SESSION4_FINAL.md for full spec (561 lines, 6 states)
- FULL SCREEN — no top bar, no nav
- Circular timer, energy check-in, overwhelm escape hatch
- Timer colors: green → teal → warm amber (NEVER red)
- Session summary on exit
- Can be launched with tasks, custom task, or blank timer

### Page 5: Settings
Route: /settings — To be designed in Session 6
- All preferences adjustable with real-time preview
- "What Pebble has learned" section (adaptive learning transparency)
- "Things you asked me to remember" section
- Reduce motion toggle

## Color Meaning System (STRICT)

See color_system.md for complete hex codes across all 4 time-of-day themes.

Every color has ONE meaning. Never deviate:
- **Green** — completion and safety. "You did it. This is done."
- **Teal** — active and primary actions. "Click me to do something."
- **Sky blue** — upcoming and queued. "This is waiting. No rush."
- **Lilac** — paused and reflective. "This is resting. No judgment."
- **Soft orange** — AI companion voice. "Pebble is talking to you." NEVER on status indicators.
- **Neutral warm gray** — inactive and unfilled.

## NEVER use:
- Red, bright yellow, pure black backgrounds, pure white backgrounds, neon colors
- Salmon/coral on status indicators

## Four Time-of-Day Themes

Auto-detected by hour, user can override in Settings. Full gradient values in color_system.md.

- **Morning (6am-12pm):** Peach sunrise
- **Afternoon (12pm-5pm):** Warm coast — DEFAULT
- **Evening (5pm-9pm):** Warm dusk
- **Night (9pm-6am):** Deep ocean

```javascript
function getTimeTheme() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}
```

## Transitions and Animations

### Page transitions: soft slide up
- Out: opacity 0, translateY(-12px), 0.4s ease-out
- In: translateY(16px) → translateY(0), opacity 0 → 1, 0.45s cubic-bezier(0.4, 0, 0.2, 1)
- Framer Motion AnimatePresence mode="wait"

### Staggered reveal on every page load
- Elements appear one by one, ~100-120ms delay
- Each: translateY(8px) opacity 0 → translateY(0) opacity 1, 0.4s ease

### Task completion
- Dot scales 1.3x → 1x (0.3s), background teal → green (0.5s), text line-through at 0.45 opacity

### Breathing animation (upload zone)
- box-shadow pulse: 0 0 0 0px rgba(42,122,144,0.04) → 0 0 0 12px rgba(42,122,144,0.02), 4s ease-in-out infinite

### Loading indicator
- Ocean sage dot (8px, pulsing scale 0.9-1.1, 2.2s ease-in-out)
- Shimmer text (3s linear infinite)
- Context-aware messages from PEBBLE_PERSONALITY.md Layer 2.5

### General rules
- All interactive elements: 0.25s ease on hover/focus
- Rounded corners: 14px cards, 8px buttons, 12px inputs
- Respect prefers-reduced-motion (instant transitions when active)
- No jarring, no popping, no flashing. Everything breathes.

## AI Personality

Pebble has a complete personality defined across 5 layers in PEBBLE_PERSONALITY.md:
- **Layer 1:** Identity, beliefs, 7 "nevers", 6 "always" behaviors, emotional spectrum
- **Layer 2:** 12-block dynamic system prompt assembled per /api/chat call
- **Layer 2.5:** Voice (quiet poet + playful sage), loading indicator
- **Layer 3:** Three-tier content safety (hard block, soft flag, cognitive pressure)
- **Layer 4:** Scope (entire life organizer), 4 real boundaries, companion philosophy
- **Layer 5:** Adaptive learning (3 types of personalization, pattern detection, user transparency)

## API Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | /health | Health check | Working |
| GET | /api/preferences | Load preferences | Working |
| PUT | /api/preferences | Save preferences | Working |
| POST | /api/decompose | Break goal into tasks | Working |
| POST | /api/summarise | Simplify text (SSE) | Working |
| POST | /api/explain | Explain simplification | Working |
| POST | /api/nudge | Supportive nudge | Working |
| POST | /api/upload | Upload document (needs summary addition) | Working |
| POST | /api/sessions | Save session | Working |
| GET | /api/sessions | List sessions | Working |
| **POST** | **/api/chat** | **AI companion chat (SSE stream)** | **Session 5** |
| **GET** | **/api/conversations** | **Load chat history** | **Session 5** |
| **GET** | **/api/documents** | **List user's documents** | **Session 5** |

## Azure Services (8 integrated)

1. **Azure OpenAI** (GPT-4o) — all AI generation
2. **Azure Cosmos DB** (serverless) — preferences, sessions, documents, conversations, user_memory, learned_patterns
3. **Azure Blob Storage** — document archival
4. **Azure AI Document Intelligence** — PDF/Word text extraction
5. **Azure AI Content Safety** — input/output screening
6. **Azure Monitor / Application Insights** — observability
7. **Azure Key Vault** — secrets management
8. **Azure App Service** — deployment (not yet deployed)

## Backend File Structure

```
backend/
├── main.py                  ← FastAPI app + all endpoints
├── config.py                ← Settings (env vars + Key Vault)
├── models.py                ← Pydantic request/response schemas
├── db.py                    ← Cosmos DB repository (async)
├── ai_service.py            ← Azure OpenAI wrapper (all prompts)
├── chat_service.py          ← NEW: Chat logic, system prompt assembly, SSE streaming
├── content_safety.py        ← Azure Content Safety + custom cognitive pressure regex
├── blob_service.py          ← Azure Blob Storage upload
├── doc_intelligence.py      ← Azure Document Intelligence extraction
├── keyvault.py              ← Azure Key Vault client
├── monitoring.py            ← Application Insights telemetry
├── requirements.txt         ← Python dependencies
└── .env.example             ← Template for env vars
```

## Frontend File Structure

```
frontend/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx             ← React entry + BrowserRouter + Provider
│   ├── App.jsx              ← TopNav + Routes + time-of-day detection
│   ├── store.js             ← Redux: preferences, chat, taskGroups, documents, walkthrough
│   ├── components/
│   │   ├── TopNav.jsx       ← Pebble logo + nav pills + settings
│   │   ├── WalkthroughOverlay.jsx ← NEW: teal glow highlights for tour
│   │   ├── ChatMessage.jsx  ← NEW: Pebble/user message bubbles
│   │   ├── ChatInput.jsx    ← NEW: input bar with streaming state
│   │   ├── Decomposer.jsx   ← Task decomposition (adapt for Tasks page)
│   │   ├── Refactor.jsx     ← Text simplification (adapt for Documents page)
│   │   ├── PreferenceDashboard.jsx ← Preferences (adapt for Settings)
│   │   └── TimerRing.jsx    ← Circular timer (adapt for Focus Mode)
│   ├── pages/
│   │   ├── Home.jsx         ← Full chat + onboarding + walkthrough
│   │   ├── Documents.jsx    ← Three-state document processing
│   │   ├── Tasks.jsx        ← Living checklist with task groups
│   │   ├── FocusMode.jsx    ← Full-screen focus with timer
│   │   └── Settings.jsx     ← Preferences (Session 6)
│   ├── utils/
│   │   ├── api.js           ← API call helpers + SSE streaming
│   │   └── bionic.jsx       ← Bionic Reading utility
│   └── styles/
│       └── global.css       ← 4 time-of-day themes + all design tokens
```

## Redux Store Shape

```javascript
{
  preferences: {
    name, reading_level, font, theme, granularity,
    communication_style, onboarding_complete, walkthrough_complete
  },
  chat: {
    messages: [],        // {role, content, timestamp, buttons?}
    isStreaming: false,
    isLoading: false,
    error: null
  },
  taskGroups: [],        // shared between Home chat, Documents, and Tasks page
  documents: [],         // shared between Home chat and Documents page
  walkthrough: {
    active: false,
    currentStep: 0,
    completed: false
  }
}
```

## Key Constraints

- NO sidebar — top nav only
- NO red anywhere — warm accent colors only
- NO pure white or pure black backgrounds
- NO tabs on document results — conversational flow only
- NO gamification — no streaks, points, leaderboards
- NO spinning loaders — gentle pulsing only
- Home page is ONLY chat — no embedded task lists or document viewers
- Every error message sounds like Pebble talking, never technical
- Frontend checks EVERY API response for {flagged: true}
- Respect prefers-reduced-motion
- Existing components (Decomposer, Refactor, TimerRing, etc.) should be ADAPTED, not rebuilt

## Detailed Specifications

For complete details, read these documents:
- **PEBBLE_PERSONALITY.md** — Full AI personality (1,652 lines, 5 layers)
- **SESSION5_PROGRESS.md** — Home page layout + all 6 onboarding questions
- **SESSION5_PART3_COMPLETE.md** — Chat routing, document memory, walkthrough, error handling
- **SESSION5_GAPS.md** — Animation specs, chat styling, backend endpoint, Redux shape, gap fixes
- **TASKS_SPEC.md** — Complete Tasks page specification
- **SESSION2_PROMPT.md** — Complete Documents page specification
- **SESSION4_FINAL.md** — Complete Focus Mode specification (6 states)
- **color_system.md** — Full color system with all hex codes

## Development

Backend: `cd backend && uvicorn main:app --reload` (port 8000)
Frontend: `cd frontend && npm install && npm run dev` (port 5173, proxies /api to 8000)
