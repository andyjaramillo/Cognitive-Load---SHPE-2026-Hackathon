# Session 5 — Part 3 Complete Specifications
## Chat System, Routing, Memory, Walkthrough, and Error Handling
### Every detail Claude Code needs to connect the entire app

---
---

# 1. ROUTING + CHAT FLEXIBILITY

## Core Principle: Home is ONLY Chat

The Home page is Pebble's living room. It is ALWAYS clean, centered, calm. No task lists embedded. No document viewers. No widgets, dashboards, or data panels. Just the greeting, the chat, and the action buttons.

When Pebble creates tasks, references documents, or shows history — it does so CONVERSATIONALLY. Text in chat bubbles with gentle inline cards. Never a copy of another page embedded in Home.

**Why this matters for neurodiversity:** A cluttered home page creates decision paralysis. "Where do I look? What do I click first?" The Home page answers one question: "What do you need?" Everything else lives on its own page, one click away.

## App Always Opens to Home

Every time the app loads, the user lands on `/home`. Period. No deep links to other pages on initial load (unless the URL says otherwise). The greeting generates fresh every time based on time of day, user history, and context.

## How Chat Handles Every Type of Message

### Type A: Normal questions (knowledge mode)

The user asks something that doesn't relate to documents, tasks, or app features. Pebble just answers from GPT-4o's knowledge, in Pebble's voice.

**Examples:**
- "What's the capital of France?" → "Paris." (short, done)
- "Explain compound interest to me" → Pebble explains at the user's reading level preference. If it's a long explanation, Pebble might say at the end: "Want me to break this down further, or is that enough?"
- "What's 47 times 23?" → "1,081."
- "How do I make pasta carbonara?" → Pebble gives a simple answer. Life companion, remember.
- "What does 'amortization' mean?" → Pebble explains, then: "Is this from a document you're working through? I can help with the rest if you upload it."

**No buttons for normal questions.** Just conversation. Buttons only appear when there's an ACTION the user might want to take.

### Type B: Requests that map to other pages

The user wants to do something that another page is designed for. Pebble acknowledges, adds context, then offers navigation.

**"I have a document" / "I need to upload something" / "Can you read this PDF?"**
Pebble: "let's take a look. head over to documents and drop it in — I'll break it down for you."
[Button: "go to documents" → /documents]

**"I need to focus" / "Help me concentrate" / "I want to get stuff done"**
Three scenarios based on what exists in Cosmos DB:

Scenario 1 — User HAS active tasks:
Pebble: "You have [X] tasks waiting. Want to focus on those, set up something new, or just start a timer?"
[Button: "focus on my tasks" → /focus with active task group]
[Button: "set up something new" → Pebble asks "what do you want to work on?" then creates a task and launches focus]
[Button: "just a timer" → /focus with a blank 25-minute pomodoro, no task attached]

Scenario 2 — User has NO tasks:
Pebble: "What do you want to focus on? Tell me and I'll set it up, or I can just start a timer."
[Button: "start a blank timer" → /focus with 25-min pomodoro]
(Or user types what they want → Pebble creates a quick task → launches focus)

Scenario 3 — User says "no task, I just want to focus":
Pebble: "Got it. Starting a 25-minute focus session. No task, just quiet time."
[Button: "start" → /focus with blank timer, no task name displayed, just the timer and "done"/"take a break" buttons]

**"I want to organize my tasks" / "Show me my tasks"**
Pebble: "Let's see what you've got."
[Button: "go to tasks" → /tasks]

**"Change my settings" / "I want a different font"**
Pebble: "You can adjust everything in settings."
[Button: "go to settings" → /settings]

### Type C: Creating tasks inline from chat

This is a KEY feature. The user can create tasks without leaving the chat. But the tasks themselves LIVE on the Tasks page — the chat just creates them.

**Simple task creation:**
User: "I need to call mom"
Pebble: "Added 'call mom' to your tasks. ~5 minutes."
(Backend calls POST /api/decompose with the text, gets back a single task, saves to Cosmos DB tasks collection, updates Redux store)
No navigation needed. Pebble confirms it's done. If the user wants to see it: "Want to see your tasks?" [Button: "go to tasks"]

**Complex goal decomposition:**
User: "I need to study for my biology exam on Wednesday"
Pebble asks guided questions (this is the life organizer in action):
- "What chapters or topics does it cover?"
- User: "chapters 5 through 9, mostly cell biology and genetics"
- "How much time can you put in each day between now and Wednesday?"
- User: "maybe 2 hours a day"
- Pebble: "Here's what I'd do — 5 study sessions, one chapter per day, with a review session Tuesday night."

Then Pebble shows the plan as a conversational summary:
"I set up 5 tasks:
• chapter 5 — cell structure (Monday, ~2 hrs)
• chapter 6 — cell division (Monday evening or Tuesday)
• chapter 7 — DNA basics (Tuesday, ~2 hrs)
• chapters 8-9 — genetics (Tuesday evening)
• review session — skim notes and practice problems (Wednesday morning, ~1 hr)

Want me to save these as tasks?"
[Button: "save all as tasks" → creates task group "Biology Exam Prep", saves to Cosmos DB, updates Redux]
[Button: "let me adjust first" → Pebble says "what would you change?" and the user can edit conversationally]

**How this looks visually in the chat:**
The task list above is NOT rendered as a Tasks page component. It's a Pebble chat bubble with light inline formatting — the bullet points use the ocean sage dot color, task names are slightly bold, time estimates are in muted text. It looks like Pebble wrote it, not like a data table.

After saving, Pebble confirms: "Done. They're on your tasks page whenever you're ready."
[Button: "see my study plan" → /tasks with "Biology Exam Prep" group expanded]
[Button: "keep chatting"]

**Multiple items at once:**
User: "I need to call mom, finish my essay, buy groceries, and pick up my prescription"
Pebble: "That's 4 things. I'll add them all."
(Backend creates 4 individual tasks in the "My Tasks" group)
Pebble confirms: "Done — 4 tasks added. I estimated about 2 hours total. want to see them?"
[Button: "see my tasks" → /tasks]

### Type D: Emotional / personal messages

User: "I'm stressed about everything"
Pebble: "What's on your plate right now? Just tell me one thing."
(Enters compassion mode from Layer 1. Asks guided questions to turn feelings into structure.)

User: "My grandma is sick and I have finals"
Pebble: "That's a lot at once. Let's separate these. Which one has the nearest deadline?"
(Life organizer philosophy from Layer 4. Turns overwhelm into triage.)

User: "I just want to talk"
Pebble: "I'm here. What's on your mind?"
(No routing, no buttons. Just presence.)

### Type E: Edge cases

User sends an empty message or just whitespace:
Pebble generates a contextual greeting as if they just arrived.

User sends a very long message (1000+ characters):
Pebble processes it normally. If it's a document pasted directly, Pebble recognizes it: "That looks like a chunk of text. Want me to break it down? Or you can upload the full document."
[Button: "break this down" → processes inline]
[Button: "upload the full doc" → /documents]

User sends the same message repeatedly:
Pebble responds the first time, then on repeat: "I think I already helped with that. Anything else on your mind?"

## How Buttons Work (Technical)

The backend sends buttons in the final SSE event after text streaming completes:
```json
data: {"type": "actions", "buttons": [
  {"label": "go to documents", "type": "route", "value": "/documents"},
  {"label": "save all as tasks", "type": "action", "value": "create_tasks", "payload": {"tasks": [...]}},
  {"label": "keep chatting", "type": "dismiss"}
]}
```

Frontend behavior:
- `type: "route"` → navigates using React Router's `useNavigate()`
- `type: "action"` → dispatches Redux action or calls API endpoint with the payload
- `type: "dismiss"` → just removes the buttons with a fade
- Buttons fade in 0.3s ease after the last text token streams (Option C from our chat architecture)
- After one button is clicked: all buttons fade out, replaced by a small confirmation message in muted text ("tasks saved" or "navigating...")
- If user ignores buttons and types a new message: buttons dim to 30% opacity but stay visible until the next response replaces them
- Button styling: 8px border-radius, teal solid for primary action, teal soft for secondary, neutral for dismiss. Same button styles as everywhere else in the app.
- Button text is always lowercase. Calm. No exclamation marks.

## Integration with Sessions 1-4

This is critical. Claude Code needs to wire Session 5 into the existing pages:

**Tasks page (Session 3):**
- The Redux store needs a `taskGroups` state that both the Tasks page and the Home chat can read/write
- When chat creates tasks (via /api/decompose), it dispatches `addTaskGroup(group)` to Redux
- The Tasks page already renders from this state — it should show the new group immediately when the user navigates there
- The "Turn into tasks" button on the Documents page (Session 2) should dispatch to the same Redux state

**Documents page (Session 2):**
- When a document is uploaded and processed, the extracted text should be saved to Cosmos DB `documents` collection AND to Redux `documents` state
- This enables the chat to reference documents: "You uploaded a research paper earlier. Want to ask about it?"

**Focus Mode (Session 4):**
- When chat sends the user to focus mode, it passes the task group or individual task via Redux state OR URL params (e.g., `/focus?group=biology-exam-prep` or `/focus?mode=blank`)
- Focus Mode already reads from Redux — just make sure the data shape matches

**Navigation:**
- When Pebble's buttons navigate to another page, they use `navigate()` from react-router-dom
- The TopNav active state updates automatically based on the current route
- If the user navigates away from Home mid-chat, the chat state persists in Redux so when they come back, the conversation is still there

---
---

# 2. FULL DOCUMENT MEMORY

## How Documents Persist Across Sessions

### Cosmos DB `documents` collection schema:

```json
{
  "id": "doc_001",
  "user_id": "diego",
  "filename": "Company_Onboarding_Guide.pdf",
  "upload_date": "2026-03-20T14:30:00Z",
  "file_type": "pdf",
  "page_count": 12,
  "word_count": 4200,
  "summary": "A 12-page onboarding guide covering HR paperwork deadlines (Friday), safety training (before week 2), email signature setup, and manager meeting scheduling. The guide includes team contact information and company policies on PTO and remote work.",
  "sections": [
    {"title": "HR Paperwork", "summary": "Forms due Friday. Need personal info, tax forms, and ID upload.", "page_range": "1-3"},
    {"title": "Safety Training", "summary": "30-minute online course. Due before second week.", "page_range": "4-5"},
    {"title": "Email and Communication", "summary": "Signature template on page 4. Slack channels to join listed.", "page_range": "6-7"},
    {"title": "Team Info", "summary": "Manager meeting to schedule. Team roster with contact info.", "page_range": "8-12"}
  ],
  "action_items": [
    {"title": "Submit HR paperwork", "deadline": "Friday", "page_ref": "p.2"},
    {"title": "Complete safety training", "deadline": "Before week 2", "page_ref": "p.4"},
    {"title": "Set up email signature", "deadline": null, "page_ref": "p.6"},
    {"title": "Schedule manager meeting", "deadline": "Monday week 1", "page_ref": "p.9"}
  ],
  "extracted_text": "... full extracted text stored here ...",
  "source_blob_url": "https://pebble.blob.core.windows.net/documents/...",
  "active": true
}
```

### No arbitrary document limit

Users can upload as many documents as they want. The constraints are practical:

**System prompt budget:** Only load the 5 most recently active document SUMMARIES into the system prompt (~250 tokens each = ~1250 tokens total). If the user mentions an older document by name, the backend searches `documents` collection by filename and loads that specific summary.

**Massive documents (100+ pages):**
- Document Intelligence extracts text normally (it handles long docs)
- GPT-4o generates a STRUCTURED summary with sections (like the schema above)
- Pebble's response on upload: "That's a big one — [X] pages. I broke it into [N] sections. Which part do you need help with?"
- The user picks a section → Pebble loads ONLY that section's text for the detailed response
- This prevents sending 200 pages of text in one GPT call

**Storage:**
- Cosmos DB: holds summary, sections, action items, and full extracted text. No size limit issues for text documents.
- Blob Storage: holds the original file. Already built.
- If extracted text is extremely large (>100K characters), chunk it in Cosmos DB and load chunks on demand.

### How documents flow through the system

**On upload (POST /api/upload — already built, needs additions):**
1. Document Intelligence extracts text (already built)
2. Blob Storage archives the file (already built)
3. Content Safety screens the text (already built)
4. **NEW:** Call GPT-4o to generate: summary, sections, action_items, document_type
5. **NEW:** Save the complete record to Cosmos DB `documents` collection
6. **NEW:** Return `{doc_id, summary, sections, action_items, page_count}` to frontend

**On /api/chat calls (automatic context loading):**
1. Backend loads user's 5 most recent document summaries from Cosmos DB
2. Summaries go into the system prompt as Block 7 (Document Context):
   ```
   Documents this user has uploaded:
   - "Company_Onboarding_Guide.pdf" (12 pages, uploaded 2 days ago): A 12-page onboarding guide covering HR paperwork deadlines, safety training requirements...
   - "Research_Paper_Draft.docx" (8 pages, uploaded yesterday): A draft research paper on machine learning applications in healthcare...
   ```
3. If the user asks a specific question about a document (detected by mentioning a filename, or "that document" / "the onboarding guide"), the backend:
   - Identifies which document they mean
   - Loads the full extracted text (or relevant section)
   - Sends it as additional context in the GPT call
   - Pebble answers from the actual document content

**On the Documents page:**
- Below the upload zone, show "Your documents" if any exist:
  - Each doc is a small card: filename, upload date, page count, brief summary line
  - "Ask about this" button → opens chat on Home page with that doc preloaded
  - "View action items" → shows the stored action items inline
  - Cards use the warm card styling with subtle teal left border

---
---

# 3. CHAT HISTORY PERSISTENCE

## Conversations save automatically

### Cosmos DB `conversations` collection schema:

```json
{
  "id": "conv_001",
  "user_id": "diego",
  "started_at": "2026-03-20T14:30:00Z",
  "last_message_at": "2026-03-20T15:45:00Z",
  "message_count": 24,
  "messages": [
    {"role": "assistant", "content": "good afternoon, diego...", "timestamp": "2026-03-20T14:30:00Z"},
    {"role": "user", "content": "yeah what was I doing", "timestamp": "2026-03-20T14:30:15Z"},
    {"role": "assistant", "content": "you had 2 tasks left...", "timestamp": "2026-03-20T14:30:18Z"}
  ],
  "summary": null,
  "active": true
}
```

### Conversation lifecycle

**New conversation starts when:**
- User's first message after no conversation exists
- Last message in the most recent conversation was more than 2 hours ago
- User explicitly says "start fresh" or "new conversation"

**Messages save after every /api/chat exchange:**
- Backend appends both user message and AI response to the active conversation
- This happens AFTER streaming completes, not during
- If Cosmos DB save fails, the chat still works — message just won't persist

**Loading on return:**
- Home page loads → frontend calls `GET /api/conversations?limit=1`
- If conversation exists and last_message_at is within 24 hours:
  - Load the messages into the chat area
  - Show a subtle divider: "earlier today" or "yesterday"
  - Pebble's new greeting appears below the history
- If older than 24 hours or no conversation exists:
  - Fresh greeting, no history shown
  - But the AI still has context from sessions/tasks/documents via the system prompt

**50-message cap with summarization:**
- When a conversation hits 50 messages, backend:
  - Sends the first 30 messages to GPT-4o: "Summarize this conversation in 3-4 sentences."
  - Stores the summary in the `summary` field
  - Keeps only the last 20 messages in the `messages` array
  - On the next /api/chat call, the summary is prepended to the system prompt
- The user doesn't notice — the chat just keeps working

### API endpoints

```
GET  /api/conversations?limit=1           → most recent conversation
GET  /api/conversations/:id               → specific conversation
```

The frontend only calls the GET endpoint on page load. Saving is handled internally by /api/chat.

---
---

# 4. "WHAT WAS I WORKING ON?" CONNECTION

## How the lilac link works

**Visual styling:**
- Text: "what was I working on?" in lilac color (#9A88B4 afternoon theme)
- Font size: 13px, font-weight: 400
- Subtle hover: underline appears, color deepens slightly
- Positioned below the 3 quick action buttons, centered

**When clicked:**

1. Frontend sends: `POST /api/chat` with `{"message": "", "is_history_request": true, "conversation_history": []}`

2. Backend builds a context-rich response from:
   - Last 3 sessions from Cosmos DB
   - Active task groups with progress
   - Recent document summaries

3. Pebble responds conversationally:

**User with recent activity:**
"you were working on your onboarding guide last time — finished the HR forms and safety training. you still have the email signature and manager meeting left. you also uploaded a research paper draft but haven't dug into that one yet."
[Button: "pick up onboarding tasks" → /tasks with onboarding group expanded]
[Button: "look at the research paper" → /documents with that doc context loaded]
[Button: "start fresh" → Pebble: "ok, what's on your mind today?"]

**User with no history:**
"this is pretty fresh — we haven't worked on anything together yet. want to get started?"
[Button: "I have a document" → /documents]
[Button: "break down a task" → Pebble asks what task]
[Button: "just explore"]

**This is a chat message, not a separate UI.** It appears in the chat area with streaming. The lilac link just triggers it.

---
---

# 5. POST-ONBOARDING INTERACTIVE WALKTHROUGH

## When it triggers

After the 6th onboarding question is confirmed:
- Stage 1: "You're all set, [Name]." (holds 1.5s, fades)
- Stage 2: "let me show you around." (fades in, holds 1.5s)

Then the walkthrough begins as a CONTINUATION of the chat.

## How highlights work

When Pebble references a nav item, that element gets a gentle highlight:
- Soft teal glow: box-shadow 0 0 0 4px rgba(90,138,128,0.2) → 0 0 0 8px rgba(90,138,128,0.1), 2s loop
- Rest of page dims to 80% opacity (except chat area and highlighted element)
- Highlight disappears on "next" or interaction

Implementation: `WalkthroughOverlay` component with `targetSelector` prop, positioned glow via `getBoundingClientRect()`.

## The 5 Steps

### Step 1: Home
Pebble: "this is home. whenever you need anything — a question answered, a document simplified, a task broken down, or just someone to talk to — start here."
**Highlight:** Chat input bar pulses with teal glow, 3 seconds.
[Button: "got it" → skips to Step 5]
[Button: "show me more" → Step 2]

### Step 2: Documents
Pebble: "when something feels overwhelming — a long document, a confusing email, pages of text you don't want to read — bring it here. I'll break it down and pull out what matters."
**Highlight:** "Documents" nav item gets teal glow.
[Button: "what can you do with documents?" → Pebble adds: "I can simplify the language, pull out the action items, highlight what matters most, and answer any questions about it. you just upload it and tell me what you need."]
[Button: "next" → Step 3]

### Step 3: Tasks
Pebble: "tasks is where things get organized. tell me what you need to do — or send over tasks from a document — and I'll help you break them into small, doable pieces."
**Highlight:** "Tasks" nav item gets teal glow.
[Button: "how does it work?" → Pebble adds: "you can type a big goal like 'prepare for my job interview' and I'll break it into steps. or type something simple like 'call mom' and I'll just add it. tasks group together by where they came from, and you can focus on one at a time."]
[Button: "next" → Step 4]

### Step 4: Focus Mode
Pebble: "when you're ready to get things done, focus mode clears everything away. just you, one task, and a timer. if it gets to be too much, there's always an exit."
**Highlight:** "Focus" nav item gets teal glow.
[Button: "next" → Step 5]

### Step 5: Closing
Pebble: "that's everything. I'm here whenever you need me. what would you like to start with?"
**No highlights.** Regular home page state takes over.
[Button: "I have a document" → /documents]
[Button: "break down a task" → Pebble asks what task]
[Button: "just chat" → input focuses]

## State management

```javascript
walkthroughState: {
  active: false,
  currentStep: 0,    // 0=not started, 1-5=steps
  completed: false
}
```

- Starts when `onboarding_complete = true` and `walkthrough_complete = false`
- "Got it" on step 1 jumps to step 5
- Step 5 sets `walkthrough_complete: true` in Cosmos DB
- Refresh mid-walkthrough: restart from step 1 (it's short)
- Every step has small muted text: "skip tour" → sets walkthrough_complete and shows normal home

---
---

# 6. RATE LIMITING + ERROR HANDLING

## Core principle: Every error sounds like Pebble

The user NEVER feels like the app broke. Every error message is Pebble's voice — calm, warm, brief. The error is invisible. Pebble just handles it.

## Rate Limiting

**30 messages/minute, 500/day. Tracked in memory (user_id → timestamps).**

**Per-minute limit hit:**
Pebble: "I need a second to catch up. give me a moment."
- Input disables 5 seconds, ocean sage dot pulses
- Re-enables automatically

**Daily limit hit:**
Pebble: "we've been at it all day. your tasks and documents are all saved — let's pick this up tomorrow. or if you need to focus, focus mode still works."
- Input stays disabled. Other pages still function.

## Error Scenarios with Pebble Voice

### GPT-4o timeout (>15s)
Pebble: "that one's taking longer than usual. want to try again, or ask something different?"
[Button: "try again"] [Button: "ask something else"]

### GPT-4o API error (after silent retry fails)
Pebble: "something went quiet on my end. your message is saved — want me to try again?"
[Button: "try again"]

### GPT-4o rate limited (429)
Pebble: "I'm thinking about a lot of things right now. give me a moment."
- Auto-retry after the retry-after period. User sees the pulsing dot.

### Content Safety blocks INPUT
Pebble: "I want to make sure I can help you well with this. could you say that a different way?"
- No indication anything was "blocked." Feels like Pebble asking for clarity.
- Cognitive pressure detection is NOT a block — triggers compassion mode instead.

### Content Safety flags OUTPUT mid-stream
- Stop streaming. Keep partial text visible.
- Pebble adds: "let me rephrase that."
- Retry with modified prompt. If retry also flagged:
  Pebble: "I'm having trouble with this one. let's try a different angle — what specifically do you need help with?"

### Cosmos DB unavailable
- Chat works normally with session-only context (Redux state)
- Less personalized responses (no history), but still functional
- User sees nothing different

### SSE connection drops
- Partial message stays with "..." 
- Auto-reconnect 1 second. If fails 3x:
  Pebble adds: "I lost my train of thought. want me to try again?"
  [Button: "try again"]

### No internet
Pebble: "I can't reach my brain right now — looks like we might be offline. I'll keep trying."
- Dot pulses slowly. Auto-retry every 10 seconds.
- Focus Mode timer still works offline.

## Loading States (Pebble personality)

While waiting for any AI response:
- Ocean sage dot (8px, pulsing 0.9–1.1 scale, 2.2s ease)
- Shimmer text (3s linear wave)
- Messages rotate from tiers:
  - Tier 1 (60%): "thinking..." / "working on that..." / "pulling that together..."
  - Tier 2 (25%): "finding the quiet version..." / "sorting through the noise..."
  - Tier 3 (15%): "rolling this around..." / "smoothing the edges..."
- Context overrides: document processing → "reading through this..." / task creation → "breaking that down..."

## The Principle

Every error is Pebble staying calm. Most apps feel broken when something fails. Pebble feels like a friend who stumbled and caught themselves. The user's trust grows because Pebble handles problems the same way it handles everything: calmly, warmly, with a path forward.

---
---

# INTEGRATION CHECKLIST FOR CLAUDE CODE

Session 5 must verify these connections:

1. **Home chat → Tasks page:** Tasks created from chat appear on Tasks page via shared Redux state
2. **Home chat → Documents page:** "Go to Documents" button navigates correctly
3. **Home chat → Focus Mode:** "Start Focus Mode" passes tasks via Redux, blank timer option works
4. **Documents page → Home chat:** "Ask about this" on stored doc opens chat with context
5. **Documents page → Tasks page:** "Turn into tasks" creates task group in shared Redux state
6. **Tasks page → Focus Mode:** "Start focus mode" passes the active task group
7. **Focus Mode → Tasks page:** Completed tasks update Tasks page state
8. **Onboarding → Walkthrough → Home:** Smooth transition through all three states
9. **Returning user → History:** Conversation loads, "What was I working on?" triggers context response
10. **Error states → Pebble voice:** Every error fallback uses Pebble's personality, never technical language
11. **All pages → Pebble brand:** Logo says "Pebble" with DM Serif Display, ocean sage dot, subtitle only on hero

These connections make Pebble feel like ONE app instead of 5 separate pages. This is the session where it all comes together.
