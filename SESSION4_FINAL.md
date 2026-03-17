# Session 4: Build Focus Mode — Complete Specification

Read CLAUDE.md for full context. This is the most detailed session prompt. Follow every instruction exactly.

---

## OVERVIEW

Focus Mode is a full-screen, distraction-free task execution experience. It has SIX states. The user flows between them based on their actions. Focus Mode shares task state with the Tasks page via Redux — completing a task here updates the Redux store, so when the user exits and goes to /tasks, those tasks are already checked off.

---

## HOW FOCUS MODE IS ENTERED

The user clicks "Start focus mode" on the Tasks page. This passes the active task group to Focus Mode via Redux state.

Focus Mode reads from the Redux store:
- The list of tasks in the current group
- Which tasks are already completed
- Each task's name, description, and time estimate in minutes

Focus Mode starts on the first UNCOMPLETED task in the group.

If there are no tasks (user navigated to /focus directly), show a message: "No tasks to focus on. Head to Tasks to add some." with a link to /tasks.

---

## LAYOUT RULES (apply to ALL six states)

- FULL SCREEN: TopNav component is completely hidden when the route is /focus. No logo, no nav items, nothing at the top.
- Everything is centered horizontally and vertically on the screen
- Max-width for content: 440px
- The background is the active time-of-day theme gradient from the CSS custom properties (same as every other page — this is NOT a special dark mode, it just looks dark at night because of the night theme)
- Sharp design: border-radius 8px on buttons. Not 14px, not 12px. 8px.
- All text uses the theme's text colors (--text-primary, --text-secondary, etc.)
- All transitions between states: content fades out (opacity 0 over 0.3s), then new state fades in (opacity 0 to 1 over 0.4s) with a slight translateY(8px) to translateY(0) slide-up
- No cards, no bordered containers on the main focusing state. Elements are typography and the timer floating on the gradient. Other states (energy check-in, escape hatch, session summary) can use subtle containers.

---

## STATE 1: FOCUSING

This is the default state. What the user sees while working on a task.

### Element 1: Progress dots
- Position: top-left corner, 18px from edges
- Small circles, 6px diameter each, 4px gap between them
- One dot per task in the group
- Completed task: filled circle with --color-done (green)
- Current task: filled circle with --color-active (teal)
- Upcoming task: outlined circle with 1.5px border, color --color-inactive (gray)
- These dots update in real-time as tasks are completed

### Element 2: EXIT link
- Position: top-right corner, 18px from edges
- Text: "EXIT" in uppercase, 9px font-size, letter-spacing 0.3px
- Color: --text-muted (very subtle)
- On click: does NOT navigate directly to /tasks. Instead, transitions to STATE 6 (session summary)
- Cursor: pointer

### Element 3: Task name
- Position: centered, below the progress dots with ~24px margin
- Font-size: 20px, font-weight: 500, color: --text-primary
- Letter-spacing: -0.3px
- Text-align: center
- Max-width: 360px (wraps to multiple lines if needed)
- This text changes when the user completes a task and moves to the next one

### Element 4: Timer ring
- Position: centered, below task name with ~24px margin
- Size: 170px width x 170px height
- The ring is an SVG circle with:
  - Background circle: stroke color rgba version of --color-inactive at 0.08 opacity, stroke-width 2px
  - Progress circle: stroke-width 3px, stroke-linecap round
  - The progress circle depletes clockwise (use stroke-dasharray and stroke-dashoffset, rotated -90deg so it starts from the top)
  - The stroke-dashoffset should be calculated from: (1 - timeRemaining/totalTime) * circumference

- GLOW EFFECT behind the ring:
  - A div positioned absolutely behind the SVG
  - Size: 220px x 220px (25px larger on each side than the ring)
  - Background: radial-gradient with the ring's current color at center, fading to transparent
  - Opacity: ~0.15 for light themes, ~0.18 for the night theme
  - The glow color transitions along with the ring color

- RING COLOR transitions smoothly based on time remaining:
  - More than 50% time left: green (--color-done: #50946A day / #50A86E night)
  - 20% to 50% time left: teal (--color-active: #2A7A90 day / #44A0AE night)
  - Less than 20% time left: warm amber (#E0A060 day / #C8A046 night)
  - NEVER red. Amber is the warmest color.
  - Transition: CSS transition on stroke color, 2s ease. The glow color transitions too.
  - At night theme: add a CSS filter drop-shadow on the progress circle SVG: drop-shadow(0 0 8px rgba(color, 0.3)) to create a bioluminescent effect

- TIME DISPLAY inside the ring:
  - Centered in the middle of the ring
  - Show AMBIENT time, not exact countdown
  - Format: "~15m" or "~10m" or "~5m" or "~1m"
  - Update every 5 minutes for times >5min, every 1 minute for times <5min
  - Font-size: 28px, font-weight: 500, color: --text-primary
  - Letter-spacing: -1px
  - Do NOT show seconds. Do NOT show exact minutes:seconds countdown. The whole point is to reduce time pressure.

### Element 5: Done button
- Position: centered, below timer with ~24px margin
- Text: "Done"
- Padding: 12px 48px
- Border-radius: 8px
- Background: --color-done (green)
- Text color: white (light themes) or dark (#1A2028 for night theme)
- Font-size: 14px, font-weight: 500
- Box-shadow: 0 2px 12px rgba(green, 0.25)
- Cursor: pointer
- Hover: slightly brighter background, shadow increases
- On click: triggers the TASK COMPLETION FLOW (see below)

### Element 6: Skip and Break links
- Position: centered, below Done button with 10px margin
- Two text links side by side with 20px gap
- "Skip" — font-size: 10px, color: --text-muted
- "Break" — font-size: 10px, color: --color-upcoming (sky blue)
- No borders, no backgrounds, no buttons — just plain text links
- Cursor: pointer on both
- On click Skip: triggers SKIP FLOW (see below)
- On click Break: transitions to STATE 3 (break with breathing guide)

### Element 7: AI nudge
- Position: centered, below Skip/Break with ~20px margin
- PLAIN TEXT only — no card, no border, no background container
- Font-size: 10px, color: --color-ai (orange)
- Text-align: center, max-width: 340px, line-height: 1.5
- Content: AI-generated message specific to the current task
  - Call POST /api/nudge with {task_name: currentTask.name, elapsed_minutes: 0} when a task becomes active
  - Display the response text
  - If API fails or is slow (>2 seconds), use a fallback from this curated pool (pick randomly):
    - "Take this one step at a time."
    - "You already know more about this than you think."
    - "Start with the smallest piece."
    - "This doesn't have to be perfect."
    - "Just getting started is the hardest part."
  - The nudge changes EVERY TIME a new task becomes active (new API call or new random pick)
  - Never show the same nudge twice in a row

### Element 8: "I need a pause" trigger
- Position: bottom center of the screen, 16px from bottom edge
- Use margin-top: auto on a flex container to push it to the bottom
- Text: "I need a pause"
- Font-size: 9px, color: --color-paused (lilac)
- Cursor: pointer
- NOT a button — just plain text, very subtle
- On click: transitions to STATE 4 (escape hatch)

---

## TASK COMPLETION FLOW (when user clicks Done)

This is an animation sequence. Each step happens in order:

1. (0ms) The timer ring's progress circle animates to fill completely (stroke-dashoffset goes to 0). The ring color becomes green regardless of where it was. Duration: 0.4s ease.
2. (200ms) The glow behind the ring brightens to ~0.25 opacity briefly then fades back. Duration: 0.6s.
3. (400ms) The task name text gets text-decoration: line-through and opacity drops to 0.5. Duration: 0.3s.
4. (600ms) The AI nudge text changes to a completion message. Color stays orange. Content is AI-generated (call POST /api/nudge with elapsed_minutes and a flag indicating completion), with fallbacks:
   - "Nice. The next one builds on that."
   - "That's one more handled."
   - "Done. You're making progress."
   - "Solid. Moving on."
   Never "Great job!!!" or "Amazing!!!" — calm, specific, warm.
5. (1500ms) The entire state content (task name, timer, buttons, nudge) fades out with slide-up (opacity 0, translateY -12px, 0.4s).
6. (1900ms) Update Redux store: mark the current task as completed. Increment completed count.
7. (2000ms) Determine next task. If there are more uncompleted tasks: load the next one. If all tasks are done: transition to STATE 6 (session summary).
8. (2000ms) New task content fades in with slide-up (starts at opacity 0, translateY 16px, animates to opacity 1, translateY 0, 0.45s).
9. (2000ms) Timer resets: new duration based on new task's time estimate. Ring color resets based on 100% time remaining (green). Glow resets.
10. (2200ms) New AI nudge generates for the new task (API call or random fallback).
11. Progress dots update: the completed task's dot becomes green filled.

---

## SKIP FLOW (when user clicks Skip)

1. Current task slides away (opacity 0, translateX 40px, 0.3s) — slides RIGHT instead of up, to visually differentiate from completion
2. The skipped task is NOT marked as completed in Redux. It moves to the END of the uncompleted tasks list for this group.
3. AI nudge briefly shows: "No worries. Moving on." (0.5s)
4. Next uncompleted task slides in from left (opacity 0, translateX -40px to translateX 0, 0.4s)
5. Timer resets for new task
6. New nudge generates
7. Progress dots do NOT change (the skipped task's dot stays outlined)

---

## TIMER IMPLEMENTATION

Use a React ref to store the start timestamp and total duration. Use requestAnimationFrame or a setInterval (every 1000ms is fine) to update the ring progress.

```javascript
// Pseudocode
const startTime = useRef(Date.now())
const totalMs = task.timeEstimate * 60 * 1000

// Every second:
const elapsed = Date.now() - startTime.current
const remaining = Math.max(0, totalMs - elapsed)
const progress = 1 - (remaining / totalMs) // 0 to 1
const dashOffset = (1 - progress) * circumference

// For overtime:
if (remaining <= 0) {
  // Timer shows +0:30, +1:00 etc
  // Ring is fully depleted, color is amber
  // Nudge changes to overtime message
}

// Ambient time display:
const minutesLeft = Math.ceil(remaining / 60000)
// Show "~15m", "~10m", "~5m", "~3m", "~2m", "~1m"
// Only update display when the rounded value changes
```

When timer goes overtime:
- Ring stays fully depleted (dashOffset = 0), color stays amber
- Time display changes to: "+1m", "+2m" etc (still ambient, not exact)
- AI nudge changes to overtime-specific message (one-time change, not repeated):
  - "Running over? No pressure. Finish when you're ready."
  - "Take the time you need."
  - "Almost there. No rush."

---

## STATE 2: ENERGY CHECK-IN

Triggered by: completing 2 tasks since last check-in, OR 15 minutes elapsed since last check-in — whichever comes first. Track both counters in component state.

### Transition in:
1. The current focusing state content (task, timer, buttons, nudge) fades to 0.12 opacity over 0.3s. It does NOT disappear — it's visible but ghosted behind the check-in.
2. The check-in content fades in centered on screen (opacity 0 to 1, translateY 8px to 0, 0.4s).

### Check-in content:
- Heading: "Quick check-in" — 17px, font-weight 500, --text-primary
- Subheading: "How are you feeling?" — 11px, --text-secondary, 5px below heading
- Three buttons in a horizontal row, 10px gap, centered, 20px below subheading:
  
  Button 1: "Good"
  - Padding: 10px 24px
  - Border-radius: 8px
  - Background: rgba(--color-done, 0.12)
  - Border: 1px solid rgba(--color-done, 0.2)
  - Text color: --color-done (green)
  - Font-size: 12px, font-weight: 500
  
  Button 2: "Getting tired"
  - Same sizing
  - Background: rgba(--color-ai, 0.1)
  - Border: 1px solid rgba(--color-ai, 0.15)
  - Text color: --color-ai (orange)
  
  Button 3: "Too much"
  - Same sizing
  - Background: rgba(--color-paused, 0.1)
  - Border: 1px solid rgba(--color-paused, 0.15)
  - Text color: --color-paused (lilac)

### Responses:

"Good":
- Check-in fades out (0.3s)
- Focusing state fades back to full opacity (0.3s)
- Continue as normal
- Reset the check-in counters (task count = 0, timer = now)

"Getting tired":
- Check-in fades out (0.3s)
- Focusing state fades back to full opacity (0.3s)
- AI nudge changes to energy-aware message:
  - "Maybe do a shorter one next."
  - "You've been going for a while. A break after this one might help."
  - "Take it slow. There's no deadline on this."
- Reset check-in counters

"Too much":
- Check-in fades out (0.3s)
- Transition to STATE 4 (escape hatch) — same as clicking "I need a pause"

---

## STATE 3: BREAK (with breathing guide)

Triggered by clicking "Break" text link in State 1.

### Transition in:
- All State 1 content fades out (0.3s)
- Break content fades in (0.4s)
- Timer PAUSES — store the elapsed time in a ref so it can resume

### Break content (all centered):

1. "Taking a break." — 16px, font-weight 500, --text-primary
2. "No rush." — 11px, --text-muted, 6px below
3. Breathing guide circle — 28px below "No rush."
   - Size: 120px x 120px
   - A circle that EXPANDS and CONTRACTS to guide breathing:
     - Breathe in: circle scales from 0.88 to 1.12 over 4 seconds (ease-in-out)
     - Hold: stays at 1.12 for 2 seconds
     - Breathe out: circle shrinks from 1.12 to 0.88 over 4 seconds (ease-in-out)
     - Total cycle: 10 seconds, repeats infinitely
   - Circle border: 2px solid rgba(--color-done, 0.2)
   - Circle has a subtle radial gradient fill: rgba(--color-done, 0.08) at center to transparent
   - Text inside the circle alternates:
     - "Breathe in..." visible during the expansion phase (0-4 seconds)
     - "Hold..." visible during the hold phase (4-6 seconds)
     - "Breathe out..." visible during the contraction phase (6-10 seconds)
     - Text transitions with opacity fade between each
     - Font-size: 12px, color: --text-secondary
   - Use CSS @keyframes animation for the scaling and text transitions

4. Wellness suggestion — 20px below the breathing circle
   - Font-size: 10px, color: --text-muted, font-style: italic
   - Text-align: center, max-width: 260px, line-height: 1.5
   - Picked randomly from this pool (different each break):
     - "Look away from the screen for a moment. Let your eyes rest on something far away."
     - "Stretch your arms above your head and hold for a few seconds."
     - "Roll your shoulders back slowly. Release the tension."
     - "Close your eyes and take three deep breaths on your own."
     - "Wiggle your fingers and toes. Reconnect with your body."
     - "Stand up and stretch if you can. Your body will thank you."
     - "Drink some water if you have it nearby."
   - Never show the same suggestion twice in a row (track the last one shown)

5. "I'm back" button — 24px below the wellness suggestion
   - Padding: 10px 28px
   - Border-radius: 8px
   - Background: --color-active (teal)
   - Text color: dark for night theme, white for day themes
   - Font-size: 12px, font-weight: 500
   - On click: break content fades out (0.3s), State 1 fades back in (0.4s), timer RESUMES from where it was paused

### NO time tracking on the break screen. Do NOT show how long the user has been on break. No "5 minutes elapsed" counter. That creates pressure.

---

## STATE 4: ESCAPE HATCH

Triggered by: clicking "I need a pause" in State 1, OR clicking "Too much" in State 2 (energy check-in).

This is the MOST IMPORTANT NEURODIVERSE FEATURE. Build it carefully. The entire point is to strip away ALL complexity when the user is overwhelmed.

### Transition in:
- ALL content on screen fades to opacity 0 over 0.5s (slightly slower than normal transitions — feels like the app is taking a deep breath for you)
- After 0.3s delay, escape hatch content fades in (0.5s)
- The transition should feel like the app is clearing the room

### Escape hatch content (centered on screen):

1. "One small thing:" — 12px, --text-muted
2. The micro-task — 22px, font-weight 500, --text-primary, centered, max-width 320px, line-height 1.4
   - This is the SIMPLEST possible version of the current task
   - To generate it: call POST /api/decompose with the current task name and a system instruction to return ONLY the single smallest first action (one sentence, starts with a verb)
   - If the current task is "Fill in personal info sections" → the micro-task might be "Open the email from HR."
   - If the current task is "Write 3 stories using STAR method" → the micro-task might be "Open a blank document."
   - If the API fails, use the task name as-is but with "Start:" prepended
   - 12px margin below "One small thing:"
3. "That's it. Nothing else." — 10px, --text-muted (very faded), 10px below the micro-task
4. "I can do this" button — 28px below
   - Padding: 12px 32px
   - Border-radius: 8px
   - Background: --color-active (teal)
   - Text color: appropriate for theme
   - Font-size: 13px, font-weight: 500
   - On click: transition to a mini focus mode — the micro-task stays on screen, a small 5-minute timer ring appears (smaller, 80px), and a "Done" button. No other elements. When done or timer ends, transition to STATE 5.

### NOTHING else on this screen. No progress dots, no exit link, no nudge. Just the four elements above. Maximum calm.

---

## STATE 5: AFTER ESCAPE HATCH MICRO-TASK

Shown after the user completes the micro-task from the escape hatch (clicks Done or the 5-minute timer ends).

### Content (centered):

1. "You did something. That counts." — 18px, font-weight 500, --text-primary
2. "Seriously." — 11px, --text-muted, 8px below (slight pause feeling — this word validates them)
3. Two buttons, 28px below, horizontal row, 10px gap:
   
   Button 1: "Keep going"
   - Padding: 10px 24px
   - Border-radius: 8px
   - Background: --color-done (green)
   - Text color: appropriate for theme
   - Font-size: 12px, font-weight: 500
   - On click: mark the original task (not just the micro-task) as completed in Redux. Transition back to State 1 with the NEXT task. If no more tasks, go to State 6.
   
   Button 2: "I'm done for now"
   - Padding: 10px 24px
   - Border-radius: 8px
   - Background: transparent
   - Border: 1px solid rgba(--color-inactive, 0.2)
   - Text color: --text-secondary
   - Font-size: 12px
   - On click: transition to STATE 6 (session summary)

---

## STATE 6: SESSION SUMMARY

Shown when:
- User clicks EXIT in State 1
- All tasks in the group are completed
- User clicks "I'm done for now" in State 5

### Content (centered):

1. Heading — AI-generated warm message, 20px, font-weight 500, --text-primary
   - Call POST /api/nudge or /api/chat with context about the session
   - Fallback pool (pick randomly):
     - "That was a good one."
     - "Solid session."
     - "Nice work in there."
     - "You showed up. That matters."
   - If ALL tasks were completed: "You finished everything."
   - Never "AMAZING!!!" or over-the-top. Calm, warm, real.

2. Stats — 18px below heading, horizontal row, 28px gap between each
   
   Stat 1: Completed count
   - Number: 28px, font-weight 500, color: --color-done (green)
   - Label below: "completed" — 9px, --text-muted, 2px margin-top
   
   Stat 2: Minutes spent
   - Number: 28px, font-weight 500, color: --color-active (teal)
   - Label: "minutes"
   - Calculate from: total time Focus Mode was open minus break time
   - Round to nearest minute
   
   Stat 3: Tasks for later (only show if any were skipped)
   - Number: 28px, font-weight 500, color: --color-upcoming (sky blue)
   - Label: "for later" (NOT "skipped" — that word feels judgmental)
   - If nothing was skipped, don't show this stat at all

3. Context message — 18px below stats
   - Font-size: 11px, color: --text-secondary
   - Text-align: center, max-width: 320px, line-height: 1.6
   - AI-generated: connects the session back to the source
   - Example: "That 12-page onboarding guide had a lot going on. You cut through it and got the important stuff done."
   - Fallback: "You put in focused time on what matters. The rest can wait."

4. Three buttons — 24px below context message, horizontal row (wrap on small screens), 8px gap
   
   Button 1: "Back to tasks"
   - Padding: 10px 22px
   - Border-radius: 8px
   - Background: --color-active (teal)
   - Text color: appropriate for theme
   - Font-size: 11px, font-weight: 500
   - On click: navigate to /tasks
   
   Button 2: "Done for now"
   - Padding: 10px 22px
   - Border-radius: 8px
   - Background: transparent
   - Border: 1px solid rgba(--color-inactive, 0.2)
   - Text color: --text-secondary
   - Font-size: 11px
   - On click: navigate to /home
   
   Button 3: "Talk to NeuroFocus"
   - Padding: 10px 22px
   - Border-radius: 8px
   - Background: rgba(--color-ai, 0.08)
   - Border: 1px solid rgba(--color-ai, 0.12)
   - Text color: --color-ai (orange)
   - Font-size: 11px
   - On click: navigate to /home with session context passed via Redux (so the AI can greet them with "You just finished a focus session — how are you feeling?")

5. Save session — On mount of State 6, call POST /api/sessions with:
   - tasks_completed: number
   - tasks_skipped: number
   - total_minutes: number
   - group_name: string
   - Save to Cosmos DB for session history

---

## REDUX INTEGRATION (CRITICAL)

Focus Mode reads and writes to the SAME Redux store that Tasks uses.

### Reading:
- Get the current task group from Redux (whichever group was selected when "Start focus mode" was clicked)
- Get the list of tasks and their completion status
- Get each task's name, description, and timeEstimate

### Writing:
- When a task is completed (Done button or escape hatch "Keep going"):
  - Dispatch an action to mark that task as completed in the Redux store
  - The Tasks page will reflect this when the user navigates there
- When a task is skipped:
  - Dispatch an action to move that task to the end of the uncompleted list
- Session data:
  - Store session stats in Redux so State 6 can display them
  - Also POST to /api/sessions for persistence

### Important: If the Redux store shape from Session 3 doesn't support these operations, update the store slice to add the necessary actions and reducers. But do NOT break existing Tasks page functionality.

---

## ADAPT EXISTING TimerRing.jsx

The existing TimerRing.jsx component has ring rendering logic. Adapt it — do not rebuild from scratch. Add:
- The color transition based on time remaining
- The glow effect (radial gradient div behind the SVG)
- The ambient time display instead of exact countdown
- The drop-shadow filter for night theme
- The completion animation (fill to full green)

If the existing component is too different from what's needed, you can create a new FocusTimer.jsx component, but reuse any applicable logic from TimerRing.jsx.

---

## BACKEND CONNECTIONS

| User action | API call | Notes |
|-------------|----------|-------|
| Task becomes active | POST /api/nudge | Send {task_name, elapsed_minutes: 0} for the per-task nudge |
| Timer goes overtime | POST /api/nudge | Send {task_name, elapsed_minutes: actual} for overtime nudge |
| Task completed | POST /api/nudge | Send completion context for completion message |
| Escape hatch triggered | POST /api/decompose | Send task name with instruction to return single smallest step |
| Exit Focus Mode | POST /api/sessions | Save session stats to Cosmos DB |

All API calls should have error handling. If any call fails, use the fallback content specified above. The UI should NEVER show an error message, loading spinner, or break. Fallbacks are always ready.

---

## THINGS THAT SHOULD NOT BE IN FOCUS MODE

- No TopNav
- No chat input (Focus Mode is for focusing, not chatting)
- No task description text in State 1 (just the task name — keep it minimal)
- No exact countdown timer (ambient time only)
- No red colors anywhere
- No cards or bordered containers in State 1 (just floating typography and the timer)
- No "great job!" or over-the-top celebration language
- No time tracking on breaks
- No streaks, points, or gamification
- No visible count of how many times the user clicked "I need a pause"

---

## AFTER BUILDING

Test all six states:
1. State 1: Focusing — verify timer ring animates, glow is visible, ambient time updates, colors shift as time passes
2. Task completion — verify the full animation sequence, verify Redux store updates, verify next task loads
3. Skip — verify task slides right, next task slides in from left, skipped task goes to end
4. State 2: Energy check-in — verify it triggers after 2 completions, verify all three buttons work correctly
5. State 3: Break — verify breathing circle animates, text alternates, wellness tips rotate, timer resumes on "I'm back"
6. State 4: Escape hatch — verify everything strips away, micro-task displays, "I can do this" works
7. State 5: After escape — verify "You did something" message, both buttons navigate correctly
8. State 6: Session summary — verify stats are correct, verify session is saved to API, verify all three buttons navigate correctly
9. Redux sync — complete 2 tasks in Focus Mode, exit to /tasks, verify those tasks are checked off
10. Verify TopNav is hidden on /focus route
11. Verify the time-of-day theme is applied (test by changing your system clock if needed)

Show me everything before committing.
Commit message: "Frontend Session 4: Focus Mode — 6 states, timer with glow, energy check-in, breathing guide, escape hatch, session summary, Redux sync"
