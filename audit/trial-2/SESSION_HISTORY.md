# Pebble — Session History & Fix Log
> Documented March 22, 2026. Sessions 1–12 complete.
> Use this as the ground truth for what has been built, what was broken, and what was fixed.

---

## Session 1 — App Shell & Foundation
**Date:** March 16, 2026
**Commit:** `6e50d8a`

### Built
- React + Vite + Redux Toolkit project scaffolding
- React Router with 5 page routes: `/`, `/documents`, `/tasks`, `/focus`, `/settings`
- TopNav component: "Pebble●" logo (DM Serif Display + ocean sage dot), 4 nav pills, settings gear
- Time-of-day theme system: 4 themes (morning/afternoon/evening/night) auto-detected by hour, applied via `data-time-theme` on `<html>`
- `global.css`: all CSS custom properties for all 4 themes, `.card`, `.btn`, `.btn-primary`, `.btn-ghost` base styles
- `store.js`: prefsSlice, tasksSlice, summariseSlice
- `App.jsx`: loading gate, onboarding gate skeleton

---

## Session 2 — Documents Page
**Commit:** `31a805c`

### Built
- Documents page: upload zone with drag-and-drop, file validation (PDF/Word/image, 20MB max)
- 3-phase state machine: input → question → results
- 4 guided choice cards (actions / simplify / highlights / auto)
- Breathing animation on upload zone (`@keyframes breathe`)
- SSE streaming for summarise/simplify flow
- Action items extraction via `/api/decompose`
- "Turn into tasks" → dispatches to Redux tasks

---

## Session 3 — Tasks Page
**Commits:** `2bba54b`, `29c3a88`

### Built
- Tasks page: accordion group cards, one open at a time
- ActiveTaskCard, UpcomingTaskRow, CompletedTaskRow components
- Smart add-input: simple tasks added directly, complex goals sent to `/api/decompose`
- AI group names from decompose response
- Per-task "break down", "focus on this", "More ···" menu
- "I have ___ minutes" time filter
- Tasks persisted to Cosmos DB via `loadTasks()` / `saveTasks()` in `api.js`

---

## Session 4 — Focus Mode
**Commit:** `0564075`

### Built
- Full-screen Focus Mode (hides TopNav entirely)
- 6 app states: focusing / checkin / break / escape / after-escape / summary
- Circular timer via `FocusTimer` + `TimerRing` components
- BreathingCircle component for break screen (expandable, animated)
- Energy check-in overlay
- Escape hatch ("I need a pause") → micro-task decomposition
- Session summary screen with stats
- Focus → Redux sync (`focusGroupId`, `focusTaskId`)

---

## Session 5 — Home Page, Onboarding, Backend Chat
**Commits:** `aa6f88a`

### Built
- Home page: SSE streaming chat via `/api/chat`, Pebble dot avatar on AI bubbles, user initial avatar on user bubbles
- Centered hero greeting: time-of-day poetic pools, DM Serif Display, quick action pills
- Quick actions: "I have a document" / "break down a goal" / "start focus mode"
- "What was I working on?" lilac button
- Onboarding: 11-stage state machine (welcome → name → confirm-name → meet → q2–q6 → complete → final)
- Onboarding saves preferences to Cosmos, unlocks main app via `onboardingComplete` flag
- `/api/chat` backend: full 12-block dynamic system prompt, SSE streaming, `###ACTIONS###` parsing
- `App.jsx` loading gate: `prefs.loaded` flag gates onboarding check, prevents flash

---

## Session 6 — Bug Sprint #1 (P0 fixes)
**Commit:** `3be6215` (CLAUDE.md update)

### Fixed
- **P0-1 Double AI messages**: deduplication filter in `Home.jsx` `loadConversation()` — consecutive assistant messages from Cosmos collapsed to last one only
- **P0-3 Onboarding resets on refresh**: `prefs.loaded` gate in `App.jsx` — shows loading dot, waits for `fetchPreferences()` before rendering onboarding gate
- **P0-8 Tooltip black boxes**: `SentenceTooltip` switched from `onMouseEnter` to `onClick` (mobile-safe), warm background, shows "thinking…" while loading, closes on outside click
- **P0-12 Settings says NeuroFocus**: all user-facing settings text updated
- **P4-1 AI group names**: `/api/decompose` backend now returns `group_name` field, all 3 frontend call sites use it
- **P4-5 Completion message raw group name**: changed to "you finished everything here. that's real progress."
- **P4-6 More menu toggle bug**: `triggerRef` prop added, outside-click skips trigger button
- **P4-7 "Coming soon" items**: "Move to group: coming soon" and "Merge with another: coming soon" removed from More menu
- **P6-1 Settings wired**: font, theme, timer all dispatch to Redux + call `savePreferences()`. Active state on selected button. Font applies instantly via `data-font` attribute.

### Onboarding visual improvements
- Dark theme card fix: `ChoiceCard` uses `var(--bg-card)` + `var(--border)` instead of hardcoded cream
- Name placeholder: "your name" → "Your name"
- Pebble wordmark added above each non-welcome stage (DM Serif Display, `var(--text-muted)`)
- 5 pill-shaped progress indicators on q2–q6 stages

---

## Session 7 — Pebble Voice + Focus Fixes
**Commit:** part of `5def901`

### Fixed
- **P1-2/P1-3 Pebble voice in system prompt**: `_BLOCK_1` and `_BLOCK_12_BASE` in `chat_service.py` now include explicit labeled rules: lowercase, ONE QUESTION PER RESPONSE (ABSOLUTE RULE), max 3 list items, `###ACTIONS` for navigation
- **Nudge system prompt**: `_NUDGE_SYSTEM` in `ai_service.py` updated to Pebble voice (lowercase, no exclamation marks, no "you've got this")
- **P0-13 Energy check-in triggers by task count**: changed to 30-minute elapsed time trigger
- **P0-14 "Getting tired" does nothing**: now calls `handleBreak()` (pauses timer, records break start, picks break tip)
- **P0-15 Focus Mode post-escape layout**: container now has `position: relative` so BreathingCircle positions inside it
- **P0-16 Duplicate "Talk to Pebble" button**: removed; "Done for now" renamed to "Talk to Pebble" + `navigate('/')`
- **P5-1 Standalone Focus no context**: StandaloneFocus now shows topic input screen before timer; topic label shows above timer when set
- **P4-2 Time estimates create pressure**: duration shows as `~15 min` (with `~` prefix via `formatMinutes()`)
- **P4-3 Nudge appears immediately**: auto-nudge removed from Tasks page mount; only loads in FocusMode when user starts a task
- **P4-8 "Start another group"**: button collapses current group + scrolls to add-group input
- **P4-9 "Take a break" routing**: navigates to `/focus` with `{ state: { startBreak: true } }` so StandaloneFocus shows break screen
- **P3-5 Upload breathing animation**: enhanced `@keyframes breathe` with warm double box-shadow
- **P2-1 Onboarding visual pass**: DM Serif Display headings at `clamp(20px,4vw,24px)–26px`, ChoiceCard label 15px, sub 12px, padding 16×20

### Onboarding
- `ChoiceCard` hover: visibly responds with `var(--accent-soft)` background
- `ChoiceCard` left accent + dot: 3px border-left, indicator dot scales to 1.4× and turns teal on selection
- "You're all set" → "you're all set"
- Meet stage rewritten to lowercase Pebble voice

---

## Session 8 — Documents + Focus Mode Deep Fix
**Commit:** `5def901`

### Fixed
- **P5-2 Pebble skip trail**: `TaskCount` replaced with `PebbleSkipTrail` SVG — gentle water line + ripple rings + active dot pulse + ghost pending dots
- **P5-4 Task-to-task transition glitch**: root cause was `key={currentTaskId + (completing ? '-completing' : '')}` — fixed to `key={currentTaskId}` only
- **P5-7 Energy check-in background bug**: fixed to `position: fixed, inset: 0, zIndex: 50`
- **P3-1 Documents Q&A Pebble voice**: `handleQaSubmit` now uses `chatStream` (full 12-block Pebble personality) instead of `summariseStream`
- **P3-2 Documents conversational flow**: user's input stays visible as `UserBubble` before AI response
- **P3-3 Document type detection**: `detectDocType()` heuristic detects academic/legal/instructions/article/work/unknown; contextual AI description shown
- **P3-4 Document history**: `GET /api/documents` endpoint added, `loadDocuments()` in `api.js`, saved docs section in Documents
- File emoji replaced with inline SVG file icon

---

## Session 9 — Tasks & Documents Polish
**Commit:** part of `e813f08`

### Fixed
- **Tasks.jsx `saveEdit` clears stale nudge**: `updateTask` reducer accepts `motivation_nudge` field, clears AI sub-description when task name changes
- **Documents contextual follow-up buttons**: `docType` stored as state; "Turn into tasks" only shown when `docType !== 'article'`; articles get "want to explore this further?" instead
- **Tasks page DM Serif heading**: "your tasks." in DM Serif Display (`font-weight: 400`, `clamp(1.25rem, 3vw, 1.5rem)`) with muted sub-line
- **Tasks empty state**: animated teal breathing dot + DM Serif "nothing here yet." + lowercase supporting line
- **Tasks accordion hover state**: group header uses `whileHover={{ background: 'var(--accent-soft)' }}`
- **Documents choice cards hover**: `hoveredChoice` state — background → `var(--accent-soft)`, border → dot color, dot scale → 1.4×
- **Documents saved docs cards**: teal left accent border, `whileHover={{ background: 'var(--accent-soft)' }}`
- **Focus Mode task name font**: task `h2` uses `var(--font-display)` (DM Serif Display)
- **Focus Mode nudge text size**: fontSize 10 → 12, lineHeight 1.6

---

## Session 10 — Onboarding Final Polish
**Commit:** part of `e813f08`

### Fixed
- **Onboarding ChoiceCard hover**: `whileHover` sets `background: var(--accent-soft)` + `borderColor: rgba(42,122,144,0.4)` — previously imperceptible
- **Onboarding ChoiceCard left accent + dot**: 3px borderLeft transparent → teal on selection; indicator dot with scale 1.4× animation
- **P1-6 Raw markdown in chat**: `stripMarkdown()` added to `Home.jsx`; applied at render time in `AiBubble` and at storage time in `sendMessage`/`onReplace`
- **Sidebar.jsx deleted**: dead code removed, last remaining "NeuroFocus" string in frontend removed
- **FocusMode Pebble voice**: all fallback string pools (NUDGE, COMPLETION, OVERTIME, BREAK_TIPS, SUMMARY, TIRED) converted to lowercase Pebble voice

---

## Session 11 — Comprehensive Voice Pass
**Commit:** `e813f08`

### Fixed
- **Tasks voice pass**: all button labels lowercased ("Break down" → "break down", "Focus on this" → "focus on this", etc.)
- **Tasks inline AI messages**: lowercased
- **Settings heading**: "Settings" → "settings." (DM Serif Display)
- **FocusMode comprehensive voice pass**: all remaining capitals lowercased across all 6 states; break room, check-in, summary, escape all updated
- **Home.jsx voice pass**: placeholder texts, quick action labels, error fallbacks all lowercased
- **Documents.jsx voice pass**: upload error, "+ Upload file" → "+ upload file"
- **Backend branding**: FastAPI title "NeuroFocus API" → "Pebble. API"
- **WalkthroughOverlay built**: 5-step teal spotlight tour, portal-based, `walkthroughComplete` saved to Cosmos
- **Settings communication style, reading level, granularity**: new "Communication & AI" card, all wired to Redux + `savePreferences()`
- **TopNav**: `data-nav` attributes on nav links for walkthrough targeting

---

## Session 12 — Visual Polish Pass (March 22, 2026)
**Commit:** `82a1dcf`

### Fixed
- **P1-5 Chat bubbles (Home)**: `AiBubble` background changed from `var(--bg-card)` to `rgba(200,148,80,0.07)` (soft orange AI warmth), border `rgba(200,148,80,0.16)`, warm shadow
- **Documents AIBubble**: border-radius `12px` → `18px 18px 18px 5px` (conversational shape); all variants use soft orange warmth with warm shadow
- **Documents UserBubble**: border-radius `12px` → `18px 18px 5px 18px` (right-aligned tail); teal shadow
- **Tasks ActiveTaskCard**: background `var(--bg-card)` → `rgba(42,122,144,0.04)` (subtle teal tint); `borderLeft: 3px solid var(--color-active)`; border-radius 12 → 14; deeper shadow
- **FocusMode ambient background**: radial gradient glow `rgba(42,122,144,0.07)` added to both StandaloneFocus and task-based FocusMode — centered warmth at page level
- **WalkthroughOverlay syntax fix**: `'let's begin'` → `"let's begin"` (broken single-quote string literal)
- **FocusMode duplicate position fix**: removed duplicate `position: 'relative'` property causing parse error
- **Team sync**: pulled teammate's `fix single quote bug` commit (99cec8b), resolved merge conflict

---

## Still Open as of Session 12

| # | Issue | File | Priority |
|---|-------|------|----------|
| 1 | Tasks chat hidden (`{false && ...}`) | Tasks.jsx:983 | 🔴 Critical |
| 2 | Documents sends `page:` instead of `current_page:` | Documents.jsx:427 | 🔴 Critical |
| 3 | Chapter 5 stale seed data in Cosmos | Cosmos DB | 🔴 Critical |
| 4 | Documents group name uses filename not AI name | Documents.jsx:391 | 🟡 High |
| 5 | Cross-page companion flow not integrated | All pages | 🟡 High |
| 6 | Azure App Service deployment | Azure | 🟡 High |
| 7 | Demo video + README | — | 🟡 High |
| 8 | Visual gaps found during live testing | All pages | 🟟 Medium |
