# CLAUDE.md — NeuroFocus: AI Cognitive Support Companion

> "A calm place to start."

## Project Overview

Microsoft Innovation Challenge hackathon (March 16-27, 2026). An AI cognitive support companion that transforms overwhelming information into calm, structured, personalized clarity for neurodiverse users and anyone experiencing cognitive overload.

**Challenge:** Cognitive Load Reduction Assistant
**Stack:** Python 3.11+ (FastAPI) backend + JavaScript (React + React Router + Framer Motion) frontend
**Judging Criteria (25% each):** Performance, Innovation, Breadth of Azure services, Responsible AI

## Team Reality

Diego (Fig) is the primary builder handling backend AND frontend. Andy has limited availability. Two other teammates may help with prompts and deliverables later. All code should be calibrated for a solo-builder reality. Efficiency matters but never at the cost of quality.

## Standing Code Quality Rules

Before committing or pushing ANY code, Claude must:

1. Triple-check all code — read every file modified and verify correctness end-to-end
2. Security audit — check for injection flaws, exposed secrets, missing input validation
3. Gap analysis — verify all service clients properly closed, all async calls awaited, graceful degradation works
4. Bug check — no attribute errors, no silent failures, no race conditions, no type mismatches
5. Best practices — Microsoft Azure SDK, FastAPI, React (hooks, cleanup, key props), Python (type hints, error chains)
6. Hackathon awareness — every change must serve the 3 core features and 4 judging criteria
7. Show Diego before committing — explain what was built, non-biased analysis, proposed commit message
8. Never cut corners on quality — if the polished version is better, build the polished version

## Current Progress

### Backend (COMPLETE)
All 8 Azure services integrated. Full security audit done. See backend/ for all files.
Note: `.env.example` was removed — Diego connected live Azure credentials directly.

### Frontend (Sessions 1–4 COMPLETE — Session 5 next)

- **Session 1 (DONE):** App shell, TopNav, routing, page shells (all 5 routes), time-of-day themes (morning/afternoon/evening/night), staggered animations, Framer Motion AnimatePresence page transitions
- **Session 2 (DONE):** Documents page — upload zone with breathing animation, /api/upload + /api/summarise streaming via SSE, 3-state conversational flow (input → guided question → results), content safety fix (checks Content-Type before entering SSE loop), Documents → Tasks handoff via `tasksActions.addGroup`
- **Session 3 (DONE):** Tasks page — full Redux multi-group shape, accordion groups, smart decompose via /api/decompose, ActiveTaskCard (inline edit, Break down, Focus on this, More menu), CompletedTaskRow, UpcomingTaskRow, paused section, Q&A with streaming summarise, time filter, progress bar, AI nudge per task
- **Session 4 (DONE):** Focus Mode — full 6-state implementation + StandaloneFocus timer (see details below)
- **Session 5 (NEXT):** TBD
- **Session 6 (NEXT):** TBD

## Product Identity

NeuroFocus is ONE cohesive AI companion. It knows the user through stored preferences. It adapts every interaction. It connects document processing → task management → focus execution in one natural flow. After every output, it gently suggests one contextual next step. It feels like a warm, patient friend.

The AI lives everywhere — it IS the experience. Not a sidebar tool.

## Navigation — Minimal Top Bar

NO sidebar. The app uses a clean minimal top bar:

- Left: "NeuroFocus" logo text (DM Serif Display, font-weight 500)
- Center-right: 4 nav items as small rounded pills: Home, Documents, Tasks, Focus
- Far right: Settings gear icon + user avatar circle with initial "D"
- Active nav item: teal-tinted pill background
- Inactive items: secondary text color
- Task-focused Focus Mode (when tasks exist) hides TopNav entirely — full screen
- StandaloneFocus (no tasks) shows TopNav normally

## Five Pages

### Page 1: Home (Full-Screen AI Chat)
Route: / or /home
Layout: Full screen. TopNav at top. Content centered but shifted above true center using `paddingBottom: '22vh'` (same vertical gravity as the Focus screen timer).
New users: Conversational onboarding — guided preference questions one at a time.
Returning users: Time-of-day greeting with name, quick action buttons ("I have a document", "Break down a task", "Start focus mode"), chat input.
AI chat with conversation history. Responses stream in. Chat persists across page navigation.

### Page 2: Documents (Conversational Document Processing)
Route: /documents
Layout: Centered content, max-width 540px. Clean and spacious.

THREE STATES:

**State 1 — Input:**
Centered headline: "Share what's overwhelming you."
Subtitle: "We'll make it make sense."
One unified input zone (breathing animation with subtle teal pulse): accepts pasted text OR file drops.
Small "+ Upload file" button in bottom-left. "PDF, Word, image" label.
One "Go" button bottom-right.

**State 2 — AI asks ONE guided question:**
After scanning, AI shows what it found as a chat message.
Then asks: "What would help you most right now?" with 4 guided choices:
- Teal: "Just tell me what I need to do"
- Green: "Make it easier to read"
- Sky blue: "Show me what matters most"
- Lilac: "I'm not sure, just help me"

**State 3 — Results as conversation:**
AI delivers results in chat format — not tabs, not cards.
After results, guided next steps as buttons + text input for follow-up questions.
"Turn into tasks" button dispatches `tasksActions.addGroup({ name, source: 'document', tasks })` to Redux.

### Page 3: My Tasks (Living Checklist)
Route: /tasks
Two entry points: type a goal in the input at top (calls /api/decompose), or tasks flow in from the Documents page via Redux.

**Redux shape:** `groups: [{ id, name, source, tasks: [{ id, task_name, duration_minutes, motivation_nudge, done, paused, timerStarted, nudgeText }] }]`

**Sub-components:**
- `TaskCircle` — animated SVG checkmark, blocked when done (cursor:default, no hover animation)
- `MoreMenu` — 5 items: Edit, Move to group (coming soon), Merge (coming soon), Pause, Delete. Outside-click closes via `useRef` + document mousedown listener
- `ActiveTaskCard` — inline edit (task name + duration_minutes), Break down (calls /api/decompose → replaceTask), "Focus on this" (dispatches setFocusGroup + setFocusTask then navigates), More menu, AI nudge display
- `CompletedTaskRow` — struck-through, green dot, "done" label
- `UpcomingTaskRow` — click to make active (sets activeOverrideId in parent), dimmed when time-filter active
- `TaskGroupCard` — local activeOverrideId state, auto-loads nudge when task becomes active and open, "Start focus mode" button (dispatches setFocusGroup with null focusTaskId)

**Smart add:** Single-step goals → addSimpleTask into "My Tasks". Multi-step goals → addGroup with source 'ai'. Auto-expands new group via pendingExpand pattern.

**Q&A:** Inline streaming answer using summariseStream with task list as context. Auto-fades after 10s. Dismiss × button.

**Other features:** Time filter (dim tasks over N minutes), paused section with Resume, global progress bar.

### Page 4: Focus Mode
Route: /focus

**TWO MODES depending on Redux state:**

#### Task-Focused Mode (when `focusGroupId` is set in Redux)
FULL SCREEN — TopNav completely hidden. Everything centered, max-width 440px. Content shifted above true center via `paddingBottom: '22vh'`.

**How it's entered:**
- "Start focus mode" button on TaskGroupCard → dispatches `setFocusGroup(groupId)` + `setFocusTask(null)` → starts from first uncompleted task
- "Focus on this" button on ActiveTaskCard → dispatches `setFocusGroup(groupId)` + `setFocusTask(taskId)` → starts from that specific task

**Six States:**

**State 1 — Focusing:**
- Progress dots top-left: green=done, teal=current, outlined gray=upcoming. 6px circles, 4px gap.
- EXIT top-right: 9px uppercase, color --text-muted. Clicks → State 6 (summary), does NOT navigate directly.
- Task name: 20px, font-weight 500, centered, max-width 360px. Crosses out and fades during completion animation.
- FocusTimer ring: 170px SVG. See FocusTimer.jsx component below.
- Done button: green background, padding 12px 48px, border-radius 8px. Triggers full completion animation sequence.
- Skip/Break text links: 10px, no borders. Skip → slides task right, moves to end of uncompleted list. Break → State 3.
- AI nudge: 10px orange text, no card/border. Fetched from /api/nudge when task becomes active. 2s fallback timer to random pool if API slow.
- "I need a pause": 9px lilac text at bottom. Triggers State 4.
- Energy check-in overlay: triggers after 2 task completions OR 15 minutes, whichever first. Overlays State 1 at full opacity with a ghost ring circle at 0.12 opacity behind. Three buttons: Good (continue), Getting tired (sets tired nudge), Too much (→ State 4).

**Task Completion Animation Sequence:**
1. (0ms) Ring fills to full green via forceComplete()
2. (400ms) Task name gets line-through + opacity 0.5
3. (600ms) Completion nudge replaces regular nudge (API call with elapsed_minutes)
4. (1500ms) Dispatch completeTask to Redux. Find next task from pre-dispatch snapshot.
5. (2000ms) New task content fades in. Timer resets to new task duration. Timer auto-starts.
6. If no more tasks: → State 6

**Skip Flow:**
1. Task slides right (slideDir='skip' → translateX 40px exit)
2. Dispatch skipTask to Redux (moves task to end of group.tasks array)
3. skipPending state triggers useEffect after 350ms to find and load next task
4. Progress dots do NOT change for skipped task (stays outlined)

**State 3 — Break:**
- Timer pauses (timerRef.current.pause()), breakStartRef records start time for session stats
- BreathingCircle component: 120px circle, CSS scale animation 0.88→1.12 over 4s (breathe in), hold 2s, 1.12→0.88 over 4s (breathe out), 10s cycle
- Text inside circle alternates: "Breathe in..." / "Hold..." / "Breathe out..." with opacity fade between
- Rotating wellness tip from pool of 7, never repeats consecutively
- "I'm back" button (teal): adds break duration to breakTimeRef, resumes timer

**State 4 — Escape Hatch:**
- All content fades over 0.5s (slower than normal — feels like app taking a breath)
- Calls /api/decompose with task name + instruction for single smallest first action. Fallback: "Start: [task name]"
- Shows: "One small thing:" label → micro-task text (22px) → "That's it. Nothing else." → "I can do this" button
- NOTHING else on screen — no dots, no exit, no nudge
- "I can do this" → mini 5-minute timer ring (80px) appears, Done button appears. MiniTimer component uses setInterval, auto-calls onDone when expires.

**State 5 — After Escape:**
- "You did something. That counts." (18px) + "Seriously." (11px muted)
- "Keep going": marks original escaped task as complete in Redux → next uncompleted task → State 1
- "I'm done for now": → State 6

**State 6 — Session Summary:**
- On mount: POST /api/sessions with { tasks_completed, tasks_skipped, total_minutes, group_name }. Saves once via sessionSavedRef.
- AI-generated heading (fallback pool: "That was a good one." etc.). Shows "You finished everything." if all tasks done.
- Stats row: completed count (green), minutes (teal), "for later" count (sky blue, only shown if tasks were skipped — NEVER says "skipped")
- Context message: "You put in focused time on what matters. The rest can wait."
- Three buttons: "Back to tasks" (teal → /tasks), "Done for now" (ghost → /home), "Talk to NeuroFocus" (orange tinted → /home)
- All three buttons dispatch clearFocus() before navigating

**Session tracking refs:** sessionStartRef (Date.now() on mount), breakTimeRef (accumulated break ms), tasksDoneThisSessionRef, tasksSkippedRef, completionsSinceCheckinRef, checkinTimerStartRef

#### StandaloneFocus (when no focusGroupId set — user navigates directly to /focus)
Shows TopNav at top. Content centered with paddingBottom: '22vh'.

**Duration picker — mutually exclusive modes:**
- Preset mode (default): 6 pills — 5m, 10m, 15m, 25m, 45m, 60m — plus "Custom" pill. Active preset highlighted teal. Disabled/faded while timer is running.
- Custom mode: Three side-by-side number inputs — hours (0–23), minutes (0–59), seconds (0–59) — with colons between them. "Set" button applies and returns to preset view. "← back" returns without applying. Custom pill highlights teal when a custom duration is active (activePreset === null).

**Timer:**
- 190px SVG ring, 3.5px stroke, same color transitions as FocusTimer (green >50%, teal 20–50%, amber <20%)
- Real countdown display: `formatCountdown()` → `MM:SS` or `H:MM:SS`. Font 30px for MM:SS, 24px for H:MM:SS (more chars).
- `fontVariantNumeric: 'tabular-nums'` so digits don't shift
- Ring breathes when running: Framer Motion `scale: [1, 1.03, 1]` over 8s, ease: 'easeInOut', infinite
- Radial glow behind ring, brighter when running (0.2 opacity) vs idle (0.07)
- Uses setInterval (not requestAnimationFrame) — decrements `remaining` every second

**Buttons (equal-width, minWidth 90px):**
- Idle: Start (teal)
- Running: Pause (lilac) + Stop (coral #C0655E)
- Paused: Resume (teal) + Stop (coral)
- No Reset button

**Motivational quote:**
- 15px, orange (--color-ai), max-width 340px, line-height 1.7
- textShadow: `0 0 18px rgba(200,160,70,0.38), 0 0 44px rgba(200,160,70,0.16)` — subtle warm glow
- Rotates every 5 minutes from pool of 10 focus/motivation quotes
- AnimatePresence fade (0.7s) between quotes

**Note on Stop color:** The coral `#C0655E` on the Stop button is the ONE exception to the no-coral rule. It is specifically for the destructive "stop timer" action and appears nowhere else. It is NOT used on status indicators, not used on errors, not used anywhere in Tasks or Documents.

### Page 5: Settings
Route: /settings
All preferences adjustable with real-time preview.
Reading level, font, theme (including time-of-day auto), spacing, granularity, timer, nudge style.

## FocusTimer.jsx Component (frontend/src/components/FocusTimer.jsx)

Reusable timer ring for task-focused Focus Mode. Uses `forwardRef` + `useImperativeHandle`.

**Constants:** SIZE=170, STROKE_BG=2, STROKE_FG=3, R=(SIZE-STROKE_FG*2)/2, CIRCUMFERENCE=2πR

**Imperative handle (ref.current.X):**
- `start()` — starts requestAnimationFrame loop, sets startTimeRef = Date.now()
- `pause()` — accumulates elapsed into pausedMsRef, cancels rAF
- `resume()` — restarts rAF from current pausedMs
- `reset(durationMinutes?)` — cancels rAF, resets all refs, restores full ring
- `forceComplete()` — cancels rAF, sets fillComplete=true, ring animates to full green in 0.4s
- `getElapsedMinutes()` — returns Math.round(elapsed / 60000) for nudge API calls

**Ring color logic:**
- fraction > 0.5: `var(--color-done)` (green)
- fraction 0.2–0.5: `var(--color-active)` (teal)
- fraction < 0.2: `var(--color-ai)` (amber/orange)
- fillComplete: always green

**Glow:** Hardcoded hex fallbacks per phase (green=#50946A, teal=#2A7A90, amber=#C8A046) because CSS vars can't go inside radial-gradient.

**Night theme:** `--focus-ring-shadow: drop-shadow(0 0 8px rgba(68,160,174,0.3))` set in global.css `[data-time-theme="night"]`. Applied via `filter: 'var(--focus-ring-shadow, none)'` on the SVG.

**Ambient time display** (inside ring): `~15m`, `~5m`, `~1m` for normal time. `+1m`, `+2m` for overtime. Updates when the rounded value changes. Font 28px, letterSpacing -1px, fontFamily var(--font-display).

**Overtime:** When remaining hits 0, calls `onOvertimeNudge()` prop once. Ring stays depleted (dashOffset=0), color stays amber.

## Redux Store — tasksSlice (frontend/src/store.js)

**Initial state:**
```javascript
{
  groups:       [],   // [{ id, name, source, tasks: [...] }]
  focusGroupId: null, // which group is active in Focus Mode
  focusTaskId:  null, // which specific task to start on (null = first uncompleted)
  loading:      false,
  error:        null,
}
```

**All reducers:**
- `addGroup({ name, source, tasks })` — adds new group, normalizes tasks via mapTasks()
- `addSimpleTask({ task_name, duration_minutes, motivation_nudge })` — adds to "My Tasks" manual group, creates group if missing
- `completeTask({ groupId, taskId })` — sets done: true
- `uncompleteTask({ groupId, taskId })` — sets done: false
- `pauseTask({ groupId, taskId })` — sets paused: true
- `resumeTask({ groupId, taskId })` — sets paused: false
- `deleteTask({ groupId, taskId })` — removes task; removes group if empty and source !== 'manual'
- `replaceTask({ groupId, taskId, newTasks })` — splices in sub-tasks in place at same index (Break down)
- `setTaskNudge({ groupId, taskId, nudgeText })` — sets nudgeText on task
- `updateTask({ groupId, taskId, task_name, duration_minutes })` — inline edit
- `setTaskTimer({ groupId, taskId })` — sets timerStarted = Date.now()
- `skipTask({ groupId, taskId })` — splices task out, pushes to end of array (not deleted, not completed)
- `setFocusGroup(groupId)` — sets focusGroupId (called before navigating to /focus)
- `setFocusTask(taskId)` — sets focusTaskId (null = start from first uncompleted)
- `clearFocus()` — sets both focusGroupId and focusTaskId to null (called on Summary exit)
- `setLoading(bool)`, `setError(msg)`, `clearAll()` — utility reducers

**genId()** — `Math.random().toString(36).slice(2, 10)`
**mapTasks(tasks)** — normalizes task array: adds id, done:false, paused:false, timerStarted:null, nudgeText:null, normalizes task_name/duration_minutes/motivation_nudge fields

## Color Meaning System (STRICT)

Every color has ONE meaning. Never deviate.

### Green — completion and safety
"You did it. You're safe. This is done."
- Done status chips, completed task dots, "Good" energy button, success confirmations, Done button in Focus Mode
- Morning: #58A078 / Afternoon: #50946A / Evening: #528C64 / Night: #50A86E, glow #60C888

### Teal — active and primary actions
"You're here. Click me to do something."
- Primary buttons, "Working on it" chips, active task highlight, active nav item, Start/Resume in StandaloneFocus
- Morning: #5A9AA4 / Afternoon: #2A7A90 / Evening: #3A7E8E / Night: #44A0AE, glow #60BCC8

### Sky blue — upcoming and queued
"This is waiting. No rush."
- "Up next" chips, upcoming task dots, queued items, "for later" stat in Summary
- Morning: #6892B0 / Afternoon: #6A96B8 / Evening: #6488A8 / Night: #6A8AB4, glow #80B0D8

### Lilac/purple — paused and reflective
"This is resting. No judgment."
- "Paused" chips, "Overwhelmed" energy button, deferred items, Pause button in StandaloneFocus
- Morning: #9686AE / Afternoon: #9A88B4 / Evening: #8A78A4 / Night: #8A78AE, glow #B0A0CC

### Soft orange — AI companion voice
"The AI is gently talking to you."
- AI nudges, follow-up suggestions, energy check-in containers, "Getting tired" button, motivational quotes
- NEVER on status indicators, NEVER on primary buttons, NEVER on errors
- Morning: #DCA05A / Afternoon: #E0A060 / Evening: #C89450 / Night: #C8A046, glow #D8C060

### Neutral warm gray — inactive and unfilled
"This exists but doesn't need attention."
- Unfilled checkboxes, inactive nav, placeholder text, disabled buttons, ghost borders
- Consistent: #B4AA9A range

### Coral exception — Stop button only
`#C0655E` — used ONLY on the Stop button in StandaloneFocus. One exception to the no-coral rule because it represents a destructive/stop action that needs visual weight. Never use elsewhere.

## NEVER use:
- Red, bright yellow, pure black backgrounds, pure white backgrounds, neon colors
- Salmon/coral/warm-hot colors on status indicators or anywhere except the Stop button
- "Skipped" language anywhere — say "for later" instead

## Four Time-of-Day Themes

### Morning (6am-12pm): peach sunrise
Background: radial-gradient(ellipse at 50% 38%, #FFF8F2 0%, #F8F0E8 18%, #F4EBE4 34%, #F0E6E0 50%, #EDE2DC 68%, #F0E6E0 85%, #F2E8E2 100%)
Card bg: rgba(255,253,250,0.58) border rgba(226,214,202,0.35)
Text primary: #3A3024 / Secondary: #8A7860

### Afternoon (12pm-5pm): warm coast — DEFAULT
Background: radial-gradient(ellipse at 50% 40%, #FFFAF5 0%, #F5EDE4 35%, #EAE4DC 65%, #F0EBE5 100%)
Card bg: rgba(255,255,255,0.68) border rgba(218,208,196,0.4)
Text primary: #2A2622 / Secondary: #8A7E6E

### Evening (5pm-9pm): warm dusk
Background: radial-gradient(ellipse at 50% 42%, #F6F0EE 0%, #F0E8E6 18%, #EAE2E0 34%, #E6DCDA 50%, #E2D8D8 68%, #E6E0DE 85%, #E8E2E0 100%)
Card bg: rgba(255,252,250,0.55) border rgba(214,206,204,0.35)
Text primary: #2E2828 / Secondary: #7A6E70

### Night (9pm-6am): deep ocean
Background: radial-gradient(ellipse at 50% 46%, #2C2434 0%, #241E2C 25%, #201A26 45%, #1C1822 65%, #1E1A22 85%, #201C24 100%)
Card bg: rgba(40,34,48,0.7) border rgba(80,70,90,0.45)
Text primary: #EDE8EC / Secondary: #C0B8C4 / Muted: #9A90A0
Special: `--focus-ring-shadow: drop-shadow(0 0 8px rgba(68,160,174,0.3))` — adds bioluminescent glow to Focus ring

### Time detection:
```javascript
function getTimeTheme() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}
```
Set data-time-theme on document root. Transition: 2s ease on background, 0.5s on colors. User can override in Settings.

## Transitions and Animations

### Page transitions: soft slide up
- Outgoing: opacity 0, translateY(-12px) over 0.4s
- Incoming: starts at translateY(16px) opacity 0, animates to (0, 1) over 0.45s
- Framer Motion AnimatePresence mode="wait"
- Easing: cubic-bezier(0.4, 0, 0.2, 1)

### Staggered reveal on every page load
- Elements appear one by one with ~100-120ms delay
- Each element: translateY(8px) opacity 0 → (0, 1) over 0.4s ease

### Task completion micro-interaction
- Dot scales 1.3x then back to 1x (0.3s)
- Background shifts teal → green (0.5s ease)
- Text gets line-through and opacity 0.45 (0.4s ease)

### Breathing animation (document upload zone)
- box-shadow pulse: 0 0 0 0px rgba(42,122,144,0.04) → 0 0 0 12px rgba(42,122,144,0.02) over 4s ease-in-out infinite

### Focus ring breathing (StandaloneFocus only)
- Framer Motion scale: [1, 1.03, 1] over 8 seconds, ease: 'easeInOut', repeat: Infinity
- Only active when status === 'running'. Stops when paused or idle.

### Focus State transitions
- Normal: fadeUp — y: 16→0, opacity 0→1, 0.4s, exit y: -12, 0.3s
- Escape hatch entry: fadeUpSlow — 0.5s in, 0.5s out (slightly slower — feels like room clearing)

### General rules
- All interactive elements: 0.25s ease on hover/focus
- Rounded corners: 14px cards, 8px buttons, 12px inputs
- No jarring, no popping, no flashing. Everything breathes.

## Key Constraints

- NO sidebar — top nav only
- NO red anywhere — warm accent colors only (coral Stop button is the one documented exception)
- NO pure white or pure black backgrounds
- NO tabs on document results — conversational flow only
- NO gamification — no streaks, points, leaderboards
- NO open-ended AI questions — always guided choices with "type your own" option
- NO spinning loaders — gentle pulsing only
- NO exact countdown in task-focused Focus Mode — ambient time only (~ labels). StandaloneFocus DOES show exact MM:SS / H:MM:SS
- NO "Skipped" label anywhere — use "for later"
- NO time tracking on break screen — no elapsed counter
- NO visible count of "I need a pause" clicks
- Salmon/coral ONLY on Stop button, NEVER on status indicators
- Green = done, Teal = active, Sky blue = upcoming, Lilac = paused, Orange = AI voice
- Frontend checks EVERY API response for {flagged: true}
- Content Safety: always check Content-Type before entering SSE loop (summariseStream)

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
| POST | /api/upload | Upload document | Working |
| POST | /api/sessions | Save session | Working |
| GET | /api/sessions | List sessions | Working |
| POST | /api/analyze | Full pipeline | To build |
| POST | /api/checkin | Energy check-in | To build |
| POST | /api/chat | AI companion chat | To build |

**API usage in Focus Mode:**
- Task becomes active → POST /api/nudge `{ task_name, elapsed_minutes: 0 }`
- Timer goes overtime → POST /api/nudge `{ task_name, elapsed_minutes: actual }` (once)
- Task completed → POST /api/nudge with completion context
- Escape hatch triggered → POST /api/decompose `{ goal: task_name, granularity: 'micro', reading_level: 'simple' }` — expects single smallest first action
- Focus Mode exits → POST /api/sessions `{ tasks_completed, tasks_skipped, total_minutes, group_name }`

**All Focus Mode API calls have fallback content. The UI NEVER shows an error or breaks due to API failure.**

## Azure Architecture — 8 Services

1. **Azure OpenAI (GPT-4o)** — All AI. Structured JSON output. Low temperature. Streaming SSE.
2. **Azure Cosmos DB (NoSQL)** — Preferences, sessions, cached document results. Serverless.
3. **Azure AI Content Safety** — Two-layer: cognitive pressure regex + Azure API. Calm JSON at 200 status.
4. **Azure AI Document Intelligence** — prebuilt-read model. Magic byte validation.
5. **Azure Blob Storage** — User-scoped paths. Archival only.
6. **Azure App Service** — Hosts backend. Managed identity for Key Vault.
7. **Azure Monitor / App Insights** — OTel spans → customEvents. 4 custom events tracked.
8. **Azure Key Vault** — 10 secrets. DefaultAzureCredential. model_copy() avoids pydantic re-resolution.

## Backend Structure

```
backend/
├── main.py
├── config.py
├── models.py
├── db.py
├── ai_service.py
├── content_safety.py
├── blob_service.py
├── doc_intelligence.py
├── monitoring.py
├── keyvault.py
└── requirements.txt
```

## Frontend Structure

```
frontend/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx
│   ├── App.jsx              ← Router, layout, TopNav. Early-returns <FocusMode /> for /focus route (no nav wrapper)
│   ├── store.js             ← Redux slices: prefs, tasks (with focusGroupId/focusTaskId), summarise
│   ├── pages/
│   │   ├── Home.jsx         ← Greeting + quick action buttons + chat input. paddingBottom: 22vh
│   │   ├── Documents.jsx    ← 3-state conversational document processing
│   │   ├── Tasks.jsx        ← Multi-group accordion living checklist
│   │   ├── FocusMode.jsx    ← 6-state task Focus + StandaloneFocus timer
│   │   └── Settings.jsx     ← Preferences (shell, not yet fully built)
│   ├── components/
│   │   ├── TopNav.jsx       ← Horizontal top nav (logo + pills + icons)
│   │   ├── FocusTimer.jsx   ← forwardRef SVG ring for task-focused Focus Mode
│   │   ├── TimerRing.jsx    ← Original timer component (used in Settings/elsewhere, not Focus)
│   │   ├── Sidebar.jsx      ← DEPRECATED — kept for reference only
│   │   └── PreferenceDashboard.jsx
│   ├── utils/
│   │   ├── api.js           ← All API calls. summariseStream checks Content-Type before SSE loop.
│   │   └── bionic.jsx
│   └── styles/
│       └── global.css       ← CSS vars, time-of-day themes, --focus-ring-shadow for night theme
```

## Responsible AI — Core Design Principles

- ALL AI output: calm, supportive, non-anxiety-inducing
- Content Safety: standard + custom cognitive pressure detection
- NEVER open-ended questions — always guided choices
- After every output: one gentle contextual suggestion
- Error messages: warm tone, never alarming
- Overwhelm escape hatch in Focus Mode (State 4 — strips all complexity to ONE micro-task)
- Explainability: every simplification shows WHY
- User always in control
- Focus Mode never shows a count of how many times user clicked "I need a pause" — no shame
- "For later" not "skipped" — language matters
- Break screen has NO time elapsed counter — that creates pressure

## Development

Backend: `cd backend && uvicorn main:app --reload` (port 8000)
Frontend: `cd frontend && npm install && npm run dev` (port 5173, proxies /api to 8000)
