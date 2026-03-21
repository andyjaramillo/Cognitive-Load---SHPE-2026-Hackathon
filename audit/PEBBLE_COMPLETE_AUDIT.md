# PEBBLE COMPLETE AUDIT — March 19, 2026 (Day 4 of 11)

> 46 screenshots audited across all 6 sections: Onboarding, Home/Chat, Documents, Tasks, Focus Mode, Settings.
> Every issue documented. Fig's observations + Claude's independent analysis merged and prioritized.

---

## HOW TO USE THIS DOCUMENT

1. **Paste the GOTCHA_LIST.md into CLAUDE.md** as a new section before "Standing Code Quality Rules"
2. **Give Claude Code the SESSION_INSTRUCTIONS.md** as the opening message
3. **Give Claude Code 6-8 key screenshots** (marked with 📸 below) so it can see the actual problems
4. **Work through fixes in the priority order listed here** — P0 first, always

---

## P0 — CRITICAL BUGS (app is broken, judges will see failures)

### P0-1: Double AI messages everywhere
**Pages affected:** Home chat, Documents chat, Tasks chat
**What happens:** Every AI response renders as TWO separate chat bubbles with slightly different wording.
**Root cause:** SSE stream handler in Home.jsx is creating a message from accumulated tokens AND a separate message from the replace/done event. Both render.
**Fix:** In the SSE event handling, ensure only ONE message entry exists per AI turn. When `onReplace` fires, it should REPLACE the accumulated message, not create a new one. Check `chatStream()` in `api.js` and the event handlers in `Home.jsx`.
📸 **Screenshot:** Home chat Image 7

### P0-2: ###ACTIONS raw markers visible in chat
**Pages affected:** Home chat
**What happens:** Raw JSON like `###ACTIONS[{"label":"Add tasks","type":"route","value":"/tasks"}]###` shows as visible text inside AI message bubbles.
**Root cause:** Backend regex strip in `chat_service.py` isn't catching all cases. Some markers leak through.
**Fix:** Double-strip approach: (1) fix the backend regex in chat_service.py, (2) add a frontend safety strip in Home.jsx before rendering any AI message: `content.replace(/###ACTIONS\[.*?\]###/gs, '')`
📸 **Screenshot:** Home chat Image 12, Image 14

### P0-3: Onboarding resets on every page refresh
**Pages affected:** Entire app
**What happens:** Refreshing the browser shows the onboarding intro screen even for users who completed it.
**Root cause:** Either App.jsx isn't calling `fetchPreferences()` on mount, or it's not waiting for the API response before checking `onboardingComplete`. The `prefs.loaded` flag must gate the decision.
**Fix:** Verify App.jsx loads preferences from Cosmos BEFORE rendering the onboarding gate. Add a loading screen while preferences are being fetched.

### P0-4: Chat history wiped on navigation/refresh
**Pages affected:** Home, Documents, Tasks (all chat areas)
**What happens:** Leaving a page and returning loses all conversation. Refreshing loses everything.
**Root cause:** Chat messages stored only in React local state. No persistence layer.
**Fix:** Save Home chat messages to localStorage after every exchange. Load them back on mount. For Documents and Tasks, same approach. Backend `GET /api/conversations` endpoint isn't built yet — localStorage is the interim fix.

### P0-5: "Chapter 5" hallucination / stale seed data
**Pages affected:** Home chat greeting
**What happens:** Pebble references "Read chapter 5" as a due task on every fresh session. User never created this.
**Root cause:** Seed/example data in Cosmos DB that the system prompt's task context block (Block 9) is loading.
**Fix:** Clear all seed data from Cosmos for user "diego" (tasks, sessions, learned_patterns containers). Verify the system prompt only loads user-created data.

### P0-6: Action buttons don't execute actions
**Pages affected:** Home chat ("Add tasks" button), Documents ("Turn into tasks" button)
**What happens:** Clicking "Add tasks" just navigates to /tasks without creating any tasks. "Turn into tasks" on Documents does nothing.
**Root cause:** Action button click handlers only do `navigate('/tasks')` without dispatching task data to Redux or calling `saveTasks()`.
**Fix:** The action handler needs to: (1) parse proposed tasks from the AI message, (2) dispatch them to the tasks Redux slice, (3) call `saveTasks()`, (4) THEN navigate.

### P0-7: Document file upload fails
**Pages affected:** Documents page
**What happens:** Uploading a .docx file immediately shows "Something went quiet. Try again or paste the text directly."
**Root cause:** Backend `/api/upload` endpoint failing — likely Document Intelligence connection issue or file not being sent correctly from frontend.
**Fix:** Check backend terminal logs when upload is attempted. Verify Document Intelligence credentials in .env. Test the endpoint directly with curl.
📸 **Screenshot:** Documents Image 3

### P0-8: Tooltip/explainability boxes render as giant black rectangles
**Pages affected:** Documents page ("Make it easier to read" result)
**What happens:** Hovering over simplified text produces huge opaque black boxes overlaying the content.
**Root cause:** Tooltip component has no max-width, wrong background color (solid black instead of warm semi-transparent), and z-index stacking issues.
**Fix:** Constrain tooltip to max-width 300px, warm semi-transparent background, proper z-index, positioned relative to hovered sentence.
📸 **Screenshot:** Documents Image 5

### P0-9: Tasks not persisted to Cosmos DB
**Pages affected:** Tasks page
**What happens:** All tasks disappear on page refresh.
**Root cause:** `loadTasks()` and `saveTasks()` exist in `api.js` but Tasks.jsx doesn't call them on mount or state change.
**Fix:** Add `useEffect` to Tasks.jsx that calls `loadTasks()` on mount and `saveTasks()` whenever `taskGroups` state changes.

### P0-10: Focus Mode Stop button is RED
**Pages affected:** Focus Mode
**What happens:** The Stop button uses a red/salmon color.
**Root cause:** Hardcoded color on the button.
**Fix:** Change to lilac or warm gray. NOTE from Fig: red is acceptable ONLY on explicit destructive actions (stop/delete) where the user is choosing to end something — NOT on status indicators, errors, warnings, or pressure elements. Update gotcha list to reflect this nuance.

### P0-11: "Talk to NeuroFocus" — branding violation
**Pages affected:** Focus Mode session summary
**What happens:** Button says "Talk to NeuroFocus" instead of "talk to pebble"
**Fix:** Find and replace all remaining "NeuroFocus" strings in the frontend codebase. grep -r "NeuroFocus" frontend/src/

### P0-12: Settings says "NeuroFocus"
**Pages affected:** Settings page
**What happens:** "Adjust how NeuroFocus looks and behaves"
**Fix:** Same grep and replace as P0-11.

### P0-13: Focus Mode energy check-in triggers by task count, not time
**Pages affected:** Focus Mode
**What happens:** Check-in appears after X tasks completed, even if user just skipped through them in seconds.
**Root cause:** Logic in FocusMode.jsx counts completed tasks instead of elapsed time.
**Fix:** Trigger check-in after 15-20 minutes of elapsed focus time, not task count.

### P0-14: Focus Mode "Getting tired" button does nothing
**Pages affected:** Focus Mode energy check-in
**What happens:** Clicking "Getting tired" produces no response.
**Fix:** Should trigger the break room or show a supportive Pebble message suggesting a pause.

### P0-15: Focus Mode post-escape-hatch UI is broken
**Pages affected:** Focus Mode
**What happens:** After clicking "I can do this" from the overwhelm screen, the UI shrinks — progress dots gone, task context gone, nudge text gone. Only task name + tiny timer + Done button remain.
**Fix:** The simplified view should still feel like Pebble — keep the breathing animation, show the Pebble dot, maintain proper sizing.
📸 **Screenshot:** Focus Mode Image 6 from first batch

### P0-16: Focus Mode "Done for now" and "Talk to NeuroFocus" do the same thing
**Pages affected:** Focus Mode session summary
**Fix:** "Done for now" should return to previous page (Tasks or Home). "Talk to Pebble" should navigate to Home chat.

---

## P1 — HOME PAGE & AI PERSONALITY (first thing judges see)

### P1-1: Restore centered hero greeting for returning users
**What's wrong:** Home page opens with an immediate chat bubble in the top left. Should be a centered "Good evening, Diego." in DM Serif Display with quick action pills, THEN the chat below.
📸 **Screenshot:** Home Image 5 (wrong) vs Home Image 6 (correct old version)

### P1-2: Fix Pebble's personality/voice across ALL AI endpoints
**What's wrong:** AI responses sound like generic ChatGPT across every page. No Pebble personality.
**Fix:** Update system prompt in `chat_service.py` Layer 2 (Block 1 identity + Block 12 response format): lowercase sentence starts, gentle metaphors, short sentences, ONE question per message max, never dump multiple questions, never list more than 3 items at once.
**Also affects:** `ai_service.py` — decompose, summarise, explain, and nudge endpoints all need the Pebble voice rules.

### P1-3: AI asks too many questions at once
**What's wrong:** "What does Microsoft do? How do they sell their products?" — 4 questions in one message.
**Fix:** System prompt instruction: "ask ONE question per message. if you need multiple pieces of information, ask the most important one first. wait for the answer before asking the next."

### P1-4: Add Pebble dot avatar to all AI messages
**What's wrong:** AI chat bubbles have no avatar (Home) or show "N" letter avatar (Documents).
**Fix:** Small #5A8A80 filled circle (8px) to the left of every AI message. Remove all letter avatars ("N", "D").

### P1-5: Fix chat bubble styling
**What's wrong:** Flat rectangles with no warmth. Yellow-tan AI bubble color doesn't match spec.
**Fix:** 20-24px border-radius, 16-20px padding, subtle warm shadow, AI bubble uses theme-appropriate warm tone (not yellow).

### P1-6: Raw markdown showing in Documents responses
**What's wrong:** `**Axis Powers**:` shows with literal asterisks in chat.
**Fix:** Add react-markdown renderer or strip markdown before display.

---

## P2 — ONBOARDING OVERHAUL (first impression for new users)

### P2-1: Complete visual redesign of onboarding
**What's wrong:** Flat gray cards on dark background. No Pebble branding. Tiny text. No hover states. No selection animations. Transitions too fast.
**Fix requirements:**
- Show Pebble● logo on welcome screen
- DM Serif Display for all question headings
- Replace gray cards with warm-toned cards: subtle borders, ocean sage border glow on hover/select
- Increase text size in cards (min 16px labels, 14px descriptions)
- Slow transitions to 0.4-0.5s between stages
- "your name" → "Your name" capitalized placeholder
- Font picker cards should render text in their actual font
- Don't pre-select "Default" with teal highlight
📸 **Screenshot:** Onboarding Images 1-4

### P2-2: Post-onboarding walkthrough not built
**What's needed:** 5-step tour with teal glow highlighting each nav section. Spec in SESSION5_PART3_COMPLETE.md §5.

---

## P3 — DOCUMENTS PAGE FIXES

### P3-1: Documents page AI doesn't use Pebble voice
**What's wrong:** Generic ChatGPT responses when asking about documents.
**Fix:** Route Documents Q&A through the Pebble personality system prompt.

### P3-2: State transition is jarring
**What's wrong:** Pasting text → clicking Go replaces the entire page. User's input disappears.
**Fix:** Input slides up, AI response appears below as continuation. User can scroll up to see what they pasted.

### P3-3: Guided choice copy needs work
**"Just tell me what I need to do"** → change to "pull out what matters" or "what should I focus on?"
**AI should analyze document type first** before offering choices — a Wikipedia article about WW2 shouldn't get "Turn into tasks" as a primary option.

### P3-4: No document history
**What's needed:** "Your documents" section showing previously uploaded/pasted documents. Requires `GET /api/documents` endpoint (not built).

### P3-5: Upload zone needs breathing animation
**Fix:** Add the subtle box-shadow pulse animation from the spec.

---

## P4 — TASKS PAGE FIXES

### P4-1: Task group titles should be AI-generated
**What's wrong:** Raw user input becomes the group title ("I need to study for an exam").
**Fix:** AI generates a clean title based on the description (e.g., "exam prep").

### P4-2: Time estimates create pressure
**What's wrong:** "2 hr 25 min remaining" countdown contradicts anti-gamification.
**Fix:** Present time as gentle estimates ("about 15 minutes") not countdowns. Consider making time optional/hideable.

### P4-3: Nudge boxes appear immediately instead of contextually
**What's wrong:** Yellow nudge text shows as soon as a task expands, before user starts working.
**Fix:** Show nudge only after user clicks "Focus on this" or after time has elapsed.

### P4-4: Task chat at bottom is broken
**What's wrong:** Messages disappear, AI doesn't execute actions, no Pebble voice.
**Fix:** Either make it fully functional (persist messages, execute task creation, use Pebble voice) or HIDE IT for the demo. A broken feature is worse than a missing one.

### P4-5: Completion message copy
**What's wrong:** "You finished all 10 tasks in i need to study for an exam" — raw group name in lowercase mid-sentence.
**Fix:** Use Pebble voice: "you finished everything in this group. that's real progress."

### P4-6: "More" menu doesn't close when clicking the More button again
**Fix:** Toggle behavior — clicking More again should close the menu.

### P4-7: "Coming soon" items should be hidden
**Fix:** Remove "Move to group: coming soon" and "Merge with another: coming soon" from the More menu. Don't show unfinished features to judges.

### P4-8: "Start another group" doesn't work
**Fix:** Should open the task input field for a new group, not just collapse current group.

### P4-9: "Take a break" routes to Focus Mode incorrectly
**Fix:** Either route to Focus Mode's break room directly (not the timer), or show an inline Pebble message: "nice work. take your time."

---

## P5 — FOCUS MODE POLISH

### P5-1: Standalone Focus Mode needs task context
**What's wrong:** Accessing Focus directly shows a blank timer with no task name or purpose.
**Fix:** Offer to pick a task from the Tasks list, name what you're focusing on, or start a blank timer.

### P5-2: Replace progress dots with pebble-skipping-on-water visualization
**Fig's creative direction:** Instead of filled/unfilled dots showing "3 of 7 done," create a visual metaphor of a pebble skipping across water. Each skip = completed task. Calming (water), on-brand (pebble), motivating without gamification, visually memorable for judges.
**Priority:** HIGH for innovation scoring. This is a differentiator.

### P5-3: Break room breathing circle should animate
**What's wrong:** Circle is static. Only text changes ("Breathe in..." → "Breathe out...").
**Fix:** Circle gently expands on inhale, contracts on exhale. 4s cycle.

### P5-4: Task-to-task transitions are glitchy
**Fix:** Use AnimatePresence with mode="wait". Current task fades out (0.3s), next task fades in (0.3s).

### P5-5: Motivational quote changes too fast
**Fix:** Rotate on a 30-60 second timer, not on button clicks.

### P5-6: "I need a pause" button is nearly invisible
**What's wrong:** Tiny text at the very bottom of the screen, easy to miss completely.
**Fix:** Make it more visible — perhaps a subtle but clear link or small button above the main action area.

### P5-7: Energy check-in visual bug
**What's wrong:** Visible lighter vertical strip in background behind the check-in.
**Fix:** Check CSS background rendering on the check-in overlay.

---

## P6 — SETTINGS PAGE (needs full build)

### P6-1: Wire existing controls to Redux/API
**Fix:** Font buttons and theme buttons should call `savePreferences()` and update Redux state with live preview.

### P6-2: Add all onboarding preferences
**What's missing:** Communication style, reading level, granularity, bionic reading toggle, reduce motion toggle, line height, letter spacing.

### P6-3: Fix theme options to match our system
**What's wrong:** Shows "Warm, Dark, High Contrast" — should be our 4 time-of-day themes + calm default.

### P6-4: Remove "Session 6" placeholder text
**Fix:** Remove all development references. Replace "Focus & Timer: built in Session 6" with actual controls or remove the section.

### P6-5: Add missing Lexend font option
**What's wrong:** Only 3 fonts shown, onboarding has 4.

---

## P7 — SYSTEMIC ISSUES (affect every page)

### P7-1: No persistence anywhere
Chat, tasks, documents, onboarding state — everything resets on refresh. This is the single biggest Performance scoring risk.

### P7-2: AI voice is generic everywhere
Not just Home chat. Every AI endpoint (decompose, summarise, explain, nudge, chat, documents Q&A, tasks Q&A) needs Pebble's voice rules.

### P7-3: Pages don't feel integrated
Home can't reliably create tasks. Documents can't push to Tasks. Tasks → Focus link works but is rough. The cross-page flow is Pebble's core innovation story and it barely works.

### P7-4: Visual design is consistently generic
Every page needs: warm theme colors applied, DM Serif Display headings, ocean sage accents, generous spacing, breathing animations, Pebble dot avatar on AI elements.

### P7-5: Broken features should be hidden for the demo
If it doesn't work, hide it. Better 3 polished features than 6 broken ones. Candidates to hide: Documents file upload (if not fixable), Tasks chat bot (if not fixable), "Move to group"/"Merge" in Tasks More menu, "Coming soon" labels.

---

## RECOMMENDED FIX ORDER FOR CLAUDE CODE

**Day 4-5 (today + tomorrow): P0 bugs**
1. Fix double messages (P0-1) — affects every page
2. Fix ###ACTIONS markers (P0-2)
3. Fix onboarding persistence (P0-3)
4. Add localStorage chat persistence (P0-4)
5. Clear seed data from Cosmos (P0-5)
6. Wire task persistence (P0-9)
7. grep/replace all "NeuroFocus" → "Pebble" (P0-11, P0-12)

**Day 5-6: P1 Home page + AI voice**
8. Restore centered hero greeting (P1-1)
9. Fix Pebble personality in system prompt (P1-2)
10. One-question-per-message rule (P1-3)
11. Add Pebble dot avatar (P1-4)
12. Fix chat bubble styling (P1-5)

**Day 6-7: P2-P4 page-specific fixes**
13. Onboarding visual redesign (P2-1)
14. Documents page critical fixes (P3-1 through P3-3)
15. Tasks page critical fixes (P4-1 through P4-5)
16. Focus Mode critical fixes (P0-10, P0-13 through P0-16)

**Day 7-8: P5-P6 polish + Settings**
17. Focus Mode polish + pebble-skipping visualization (P5-2)
18. Settings page full build (P6-1 through P6-5)
19. Hide broken features (P7-5)

**Day 8-9: Integration + testing**
20. Cross-page flow testing (Home → Tasks → Focus → Home)
21. Mobile responsiveness at 375px
22. Walkthrough build (P2-2)

**Day 9-10: Demo prep**
23. README update (NeuroFocus → Pebble, add all team members)
24. Demo video recording
25. PowerPoint deck
26. Final GitHub cleanup

---

## KEY SCREENSHOTS TO GIVE CLAUDE CODE (📸 marked above)

1. Home Image 5 — wrong greeting (chat bubble instead of hero)
2. Home Image 6 — correct old greeting (for comparison)
3. Home Image 7 — double messages
4. Home Image 12 — raw ###ACTIONS markers
5. Documents Image 3 — upload failure
6. Documents Image 5 — black tooltip boxes
7. Onboarding Image 3 — bland gray cards
8. Tasks Image 2 — overall task layout for reference
