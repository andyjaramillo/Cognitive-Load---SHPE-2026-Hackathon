# Session 5 — Gap Fixes
## Specifications that were missing from Parts 1, 2, and 3

---

# GAP 1: ONBOARDING ANIMATIONS (Complete Spec)

## General onboarding animation rules

Every transition between onboarding stages/questions uses the same pattern:
- **Outgoing content:** opacity 1 → 0, translateY(0) → translateY(-8px), duration 0.4s, ease-out
- **Incoming content:** opacity 0 → 1, translateY(12px) → translateY(0), duration 0.5s, cubic-bezier(0.4, 0, 0.2, 1)
- **Delay between out and in:** 0.15s (the screen is briefly empty — feels like a breath)
- **Framer Motion:** Use `AnimatePresence` with `mode="wait"` and `key` set to the current question number

## Stage 1 (Welcome)

**Line 1: "Welcome to Pebble."**
- Fades in from opacity 0 → 1, translateY(16px) → translateY(0)
- Duration: 0.6s, cubic-bezier(0.4, 0, 0.2, 1)
- Font: DM Serif Display, 28px on desktop / 24px on mobile
- Color: primary text color from current theme

**Line 2: "I'm here to make the overwhelming feel smaller."**
- Same animation but delayed 0.4s after line 1
- Font: system font (Inter/DM Sans), 14px, secondary text color
- Letter spacing: 0.2px

**Hold:** Both lines visible for 2.5 seconds

**Exit:** Both lines fade out together: opacity 1 → 0, translateY(0) → translateY(-8px), 0.4s ease-out

## Stage 2 (Name question)

**"First, who will I be helping?"**
- Fades in 0.15s after Stage 1 exits
- Same entrance animation as all incoming content
- Font: 20px, font-weight 500, primary text

**Input field:**
- Appears 0.2s after the question text (staggered)
- Same entrance animation (translateY 12px → 0)
- Styling: 48px height, centered, max-width 300px, border-radius 12px, teal border on focus, placeholder "your name" in muted text
- Arrow button: small circle on the right side of the input, teal, 28px

**After submit — "[Name], is that right?"**
- Input field and question fade out (standard out animation)
- Confirmation fades in with the name
- Two buttons appear staggered 0.15s apart:
  - "That's me" — teal solid, 8px border-radius
  - "Let me fix that" — neutral outline, 8px border-radius

**After "That's me":**
- "Nice to meet you, [Name]. Let me set a few things up so this feels right for you."
- Warm message, holds 1.5s, then standard transition to Question 2

## Questions 2-6 (Standard pattern)

Every question follows the same animation template:

1. **Question text** fades in first (standard entrance: translateY 12px → 0, 0.5s)
2. **Choice cards** appear 0.2s after question text, staggered 0.1s between each card
3. **Subtle note** ("You can change this anytime in Settings") appears 0.3s after last card, extra subtle: opacity 0 → 0.5, no translateY

**When user picks a choice:**
1. The chosen card scales to 1.02x and gets a teal border flash (0.15s)
2. All other cards fade to 30% opacity (0.2s)
3. If the choice triggers an immediate UI change (font or theme), that change happens NOW during this 0.2s
4. After 0.3s: everything does the standard out animation
5. AI transition message appears (e.g., "No worries. We'll go with a nice balance...") if applicable
6. After 1s: standard in animation for the next question

## Choice Card Styling (ALL questions)

- Layout: vertical stack, centered, max-width 400px
- Each card: border-radius 12px, padding 14px 18px, background rgba(255,253,250,0.5), border 1px solid rgba(210,200,188,0.25)
- Card spacing: 8px gap between cards
- Card text: 13px font-weight 500 for the main label, 10px muted for subtitle/description (if any)
- Hover: background brightens slightly, border becomes rgba(42,122,144,0.15)
- Selected: teal border 1.5px solid rgba(42,122,144,0.4), scale 1.02

**Special for Question 3 (Font):**
- Each card displays its font name IN that font
- When tapped, ALL text on the entire screen transitions to that font (CSS transition 0.3s on font-family)
- The change is immediate and visible — the question text itself changes font

**Special for Question 4 (Theme):**
- Three cards side by side (not stacked) — they're preview windows
- Each card: 120px × 160px, rounded 14px, shows a miniature version of the theme with tiny gradient background and sample UI elements
- When tapped: the ENTIRE screen background crossfades to the new theme (transition 0.8s ease on background, 0.3s on all other colors)
- This is THE wow moment — the room changes around you

**Special for Questions 2, 5, 6 (with "Let me describe" option):**
- "Let me describe what I need" choice, when tapped, smoothly expands to reveal a text input below the cards
- The other cards fade slightly (to 40% opacity) but stay visible
- The text input has a small "done" button
- After the user types and submits, the choice acts like any other selection

**Special for Questions 2, 5, 6 (with "I'm not sure" option):**
- "I'm not sure yet" / "I'll figure it out as I go" — tapping this shows a brief AI message before transitioning: "No worries. We'll start with [default] and you can adjust anytime."
- The AI message fades in where the cards were, holds 1.2s, then transitions to the next question

## Transition from onboarding to walkthrough

After Question 6 is confirmed:
1. All onboarding content does the standard out animation
2. Brief pause (0.3s)
3. "You're all set, [Name]." fades in centered — same style as the welcome text (DM Serif Display, 24px)
4. Holds 1.5s
5. Fades out
6. "let me show you around." fades in — smaller, 16px, secondary text
7. Holds 1s
8. The TopNav slides in from the top (translateY -52px → 0, 0.5s ease)
9. The walkthrough Step 1 message appears in the chat area
10. The onboarding full-screen state dissolves — the user is now on the Home page with the nav visible and the walkthrough active

**The nav appearing is the bridge.** During onboarding, no nav. Once "let me show you around" plays, the nav slides in. Then the walkthrough highlights nav items that are now visible.

---

# GAP 2: CHAT MESSAGE STYLING

## Pebble message bubbles

- Alignment: left-aligned
- Avatar: ocean sage dot (8px circle, #5A8A80) positioned to the left of the bubble, vertically centered with the first line of text. NOT a letter avatar — just the dot. This matches the brand.
- Bubble: border-radius 14px (top-left 4px to indicate it's coming from the left), background var(--bg-card), border 1px solid var(--bg-card-border)
- Text: 13px, primary text color, line-height 1.6
- Max-width: 85% of chat area
- Padding: 12px 16px

## User message bubbles

- Alignment: right-aligned
- No avatar (the user knows they sent it)
- Bubble: border-radius 14px (top-right 4px), background rgba(42,122,144,0.08) — subtle teal tint
- Text: 13px, primary text color, line-height 1.6
- Max-width: 75% of chat area
- Padding: 12px 16px

## Pebble AI-voice messages (follow-up suggestions, nudges)

- Same as Pebble message but with soft orange tint: background rgba(224,160,96,0.06), border rgba(224,160,96,0.12)
- Used for: "want me to do anything else?", action suggestions, nudges
- Contains buttons when applicable

## Streaming appearance

- Text appears word by word (not character by character — that's too slow and feels like a typewriter)
- Each word fades in: opacity 0 → 1 over 0.1s
- This creates a gentle "flowing in" effect rather than a harsh character-by-character type
- The pulsing ocean sage dot + shimmer text shows BEFORE the first word arrives
- Once the first word arrives, the loading indicator disappears and text starts flowing

## Inline task cards in chat

When Pebble lists tasks in a chat message (e.g., study plan), they render as:
- A card inside the chat bubble with slightly darker background: rgba(255,253,250,0.4)
- Border-radius 10px, padding 12px
- Each task: ocean sage dot (6px) + task name (12px, font-weight 500) + time estimate in muted text
- Tasks separated by 1px divider lines
- The card is NOT interactive (no checkboxes, no expand) — it's a preview. The real interaction is on the Tasks page.

## Inline document references in chat

When Pebble mentions a document:
- Small inline card: document icon (or just a teal dot) + filename in slightly bold + page count in muted text
- Not a link — just context. The button below offers navigation if the user wants it.

---

# GAP 3: BACKEND /api/chat ENDPOINT SPEC FOR CLAUDE CODE

## What Claude Code needs to build in the backend

### New file: backend/chat_service.py

```python
# This service handles all chat logic:
# 1. Content Safety input screening
# 2. Context loading from Cosmos DB (preferences, sessions, documents, conversations)
# 3. Dynamic system prompt assembly (12 blocks from PEBBLE_PERSONALITY.md Layer 2)
# 4. GPT-4o streaming call
# 5. Content Safety output screening (batched every ~50 tokens)
# 6. Action button generation
# 7. Conversation saving to Cosmos DB
```

### New endpoint in backend/main.py: POST /api/chat

**Request body:**
```json
{
  "message": "string — the user's message",
  "conversation_history": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "is_greeting": false,
  "is_history_request": false
}
```

**Response: Server-Sent Events stream**
```
data: {"type": "token", "content": "good"}
data: {"type": "token", "content": " afternoon"}
data: {"type": "token", "content": ", diego."}
...
data: {"type": "actions", "buttons": [{"label": "go to tasks", "type": "route", "value": "/tasks"}]}
data: {"type": "done"}
```

**Special flags:**
- `is_greeting: true` → backend generates a contextual greeting, no user message needed
- `is_history_request: true` → backend loads sessions/tasks/documents and generates a "what you were working on" summary

### System prompt assembly (from PEBBLE_PERSONALITY.md Layer 2)

The backend assembles 12 blocks into the system prompt. Claude Code should read PEBBLE_PERSONALITY.md Layer 2 for the full specification. Summary:

1. Base personality (from Layer 1 — who Pebble is, beliefs, nevers, always)
2. User preferences (from Cosmos DB — name, reading level, communication style, granularity)
3. Custom memories (from Cosmos DB `user_memory` collection — things user asked Pebble to remember)
4. Learned patterns (from Cosmos DB `learned_patterns` — behavioral adaptations, Layer 5)
5. Time context (current time of day, how long since last visit)
6. Emotional state (if cognitive pressure detected in input, add compassion mode instruction)
7. Session context (recent sessions — what they were working on)
8. Document summaries (5 most recent from Cosmos DB `documents`)
9. Task context (active task groups and their progress)
10. Current page context ("user is on the home page chatting")
11. Safety instructions (from Layer 3 — content screening rules)
12. Response instructions (length, format, tone rules based on preferences)

### New Cosmos DB collections needed

Claude Code needs to add these to the database initialization:

1. `documents` — schema in SESSION5_PART3_COMPLETE.md Section 2
2. `conversations` — schema in SESSION5_PART3_COMPLETE.md Section 3
3. `user_memory` — simple {user_id, memory_id, content, created_at, active}
4. `learned_patterns` — schema in PEBBLE_PERSONALITY.md Layer 5

### New API endpoints to add to main.py

```
POST /api/chat                    — the main chat endpoint (SSE stream)
GET  /api/conversations?limit=1   — load most recent conversation
GET  /api/documents               — list user's documents with summaries
```

### Updates to existing endpoints

**POST /api/upload:**
- After extracting text, call GPT-4o to generate summary + sections + action_items
- Save the complete document record to Cosmos DB `documents` collection
- Return the doc_id and summary in the response

---

# GAP 4: WALKTHROUGH → HOME TRANSITION

## The exact sequence

1. Onboarding Question 6 confirmed → standard out animation
2. "You're all set, [Name]." centered, DM Serif Display 24px → fades in 0.5s, holds 1.5s, fades out 0.4s
3. "let me show you around." centered, 16px secondary → fades in 0.5s, holds 1s
4. **TopNav slides in** from top: translateY(-52px) → translateY(0), 0.5s cubic-bezier(0.4, 0, 0.2, 1)
5. "let me show you around" text fades out
6. **Chat area appears** — the walkthrough messages render as Pebble chat messages
7. Walkthrough Step 1 plays as described in Part 3

## After walkthrough completes (Step 5)

1. Walkthrough overlay (the dimming + highlights) fades away: 0.4s ease
2. The 3 quick action buttons appear below the last Pebble message (staggered, 0.1s each)
3. The chat input bar at the bottom becomes active
4. The user is now on the normal returning user home page
5. Their preferences are saved, their first conversation is started, they can do anything

## State flags saved to Cosmos DB preferences

```json
{
  "onboarding_complete": true,
  "walkthrough_complete": true,
  "name": "Diego",
  "reading_level": "standard",
  "font": "dm-sans",
  "theme": "auto",
  "granularity": "normal",
  "communication_style": "balanced"
}
```

---

# GAP 5: PEBBLE AVATAR CLARIFICATION

Throughout the app, Pebble is represented by the **ocean sage dot** — not a letter avatar.

- In chat messages: 8px circle, #5A8A80 (afternoon) / theme-adjusted for other times
- In the nav/logo: the dot after "Pebble"
- In loading states: the pulsing dot
- In the onboarding welcome: no avatar (just text)
- In the walkthrough: messages have the dot avatar like normal chat

**NEVER use a letter avatar ("N" or "P").** The earlier sessions used "N" for NeuroFocus — Claude Code should replace any "N" avatar references with the ocean sage dot. This is part of the rename from NeuroFocus to Pebble.

---

# GAP 6: CONVERSATION HISTORY — WHO OWNS IT?

## The flow (no conflict, both are true):

1. **On page load:** Frontend calls `GET /api/conversations?limit=1`. If a recent conversation exists, loads the messages into Redux state AND into the chat UI.
2. **During a session:** Frontend manages conversation_history in Redux memory. Each /api/chat request includes the conversation_history from Redux.
3. **After each exchange:** Backend appends the user message + AI response to Cosmos DB `conversations` collection. This happens AFTER streaming completes.
4. **If the user refreshes:** Step 1 again — loads from Cosmos DB, puts in Redux.

**Source of truth during a session:** Redux (in memory).
**Source of truth across sessions:** Cosmos DB (persistent).
**No conflict.** The frontend sends history with each request (so the backend doesn't need to re-load it mid-conversation), and the backend saves it (so it persists across page reloads).

---

# GAP 7: REDUCED MOTION SUPPORT

All animations should respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

When reduced motion is active:
- Page transitions: instant swap, no slide
- Staggered reveals: all elements appear at once, no delay
- Breathing animation: static border, no pulse
- Loading indicator: static dot, no pulse (shimmer text still shows but without animation)
- Theme change: instant, no crossfade
- Task completion: instant color change, no scale animation

This is a WCAG requirement and a Responsible AI scoring point.

Additionally, in Settings (Session 6), there should be a "Reduce motion" toggle that forces this regardless of system preference.

---

# GAP 8: DM SERIF DISPLAY FONT LOADING

Claude Code needs to add DM Serif Display to the font imports. It's used for:
- The "Pebble." logo text in the nav
- The welcome message ("Welcome to Pebble.") during onboarding
- The closing message ("You're all set, [Name].") during onboarding

Add to `index.html` or `global.css`:
```html
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap" rel="stylesheet">
```

Or in CSS:
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap');
```

---

# GAP 9: MOBILE RESPONSIVENESS

The app should work on tablet and mobile screens. Basic responsive rules:

**Desktop (>768px):** Full layout as designed. Chat area max-width 640px centered.

**Tablet (768px and below):**
- Nav items shrink slightly (font-size 10px → 9px, padding reduces)
- Chat area fills more width (max-width 95%)
- Onboarding cards stack vertically if they were side-by-side (theme preview cards)

**Mobile (480px and below):**
- Nav becomes a bottom bar (4 items as icons with small labels)
- Chat area is full width with 12px padding
- Onboarding cards are full width, stacked
- Focus Mode is already full screen so no changes needed
- Quick action buttons stack vertically instead of horizontal row

**For the hackathon demo:** Desktop is the priority. The demo video will be recorded on a desktop browser. But basic responsive CSS prevents embarrassment if a judge opens it on their phone.

---

# GAP 10: REDUX STORE SHAPE

Claude Code needs to know the Redux store structure. Here's what Session 5 adds to the existing store:

```javascript
// store.js additions for Session 5
{
  // Existing from Sessions 1-4:
  preferences: {
    name: "Diego",
    reading_level: "standard",
    font: "dm-sans",
    theme: "auto",
    granularity: "normal",
    communication_style: "balanced",
    onboarding_complete: false,
    walkthrough_complete: false
  },
  
  // Session 5 additions:
  chat: {
    messages: [],              // array of {role, content, timestamp, buttons?}
    isStreaming: false,         // true while SSE is active
    isLoading: false,          // true while waiting for first token
    error: null                // error state for UI
  },
  
  taskGroups: [                // shared between Home chat and Tasks page
    {
      id: "group_001",
      name: "Biology Exam Prep",
      source: "chat",          // "chat" | "document" | "manual"
      source_name: null,       // filename if from document
      tasks: [
        {id: "t1", title: "Chapter 5 — cell structure", description: "...", time_estimate: 120, status: "pending"},
        // ...
      ],
      created_at: "2026-03-20T14:30:00Z"
    }
  ],
  
  documents: [                 // shared between Home chat and Documents page
    {
      id: "doc_001",
      filename: "Company_Onboarding.pdf",
      summary: "...",
      page_count: 12,
      upload_date: "2026-03-20T14:30:00Z"
    }
  ],
  
  walkthrough: {
    active: false,
    currentStep: 0,
    completed: false
  }
}
```

The existing `store.js` already has `preferences`. Claude Code adds `chat`, `taskGroups`, `documents`, and `walkthrough` slices. The Tasks page (Session 3) should already be reading from `taskGroups` — if it's using local state instead, Claude Code needs to migrate it to Redux.

---

# GAP 11: SYSTEM PROMPT BLOCK NUMBERING (CORRECTED)

The PEBBLE_PERSONALITY.md Layer 2 has the correct block numbering:

- Block 1: Base personality
- Block 2: User preferences
- Block 3: Custom memories
- Block 4: Learned patterns
- Block 5: Time context
- Block 6: Emotional state
- Block 7: Session history (recent sessions, what they were working on)
- Block 8: Document summaries (uploaded docs)
- Block 9: Task context (active task groups)
- Block 10: Current page context
- Block 11: Safety instructions
- Block 12: Response instructions

The Part 3 doc said "summaries go into Block 7 (Document Context)" — this was wrong. Documents are Block 8. Sessions are Block 7. The personality doc is the source of truth.

---

# GAP 12: NEW USER DETECTION

**How does the frontend know it's a new user?**

On app load, the frontend calls `GET /api/preferences`:
- If the response returns preferences with `onboarding_complete: true` → returning user → show home page with greeting
- If the response returns empty/null/404 OR `onboarding_complete: false` → new user → show onboarding
- If `onboarding_complete: true` but `walkthrough_complete: false` → show walkthrough (they refreshed mid-tour)

The backend `GET /api/preferences` endpoint already exists. Claude Code just needs to add the `onboarding_complete` and `walkthrough_complete` fields to the preference schema and check them on the frontend.

---

# GAP 13: RENAME INSTRUCTIONS

Claude Code should rename all user-facing text from "NeuroFocus" to "Pebble":
- TopNav logo text: "Pebble" in DM Serif Display + ocean sage dot
- Any AI responses that say "NeuroFocus" → "Pebble"
- Any placeholder text referencing the old name
- README title
- Page title in index.html: "Pebble. — a calm place to start"

**Do NOT rename:**
- Folder names (keep `neurofocus/`)
- Azure resource names (keep as-is)
- Python package names
- Git repo name
- Anything internal/technical — only user-facing display text changes
