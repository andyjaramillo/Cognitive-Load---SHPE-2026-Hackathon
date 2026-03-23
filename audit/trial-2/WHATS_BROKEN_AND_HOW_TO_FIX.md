# What's Broken — March 22, 2026
> Complete breakdown of every known issue, root cause, and fix plan.
> 5 days until deadline (March 27).

---

## 🔴 CRITICAL — Fix today or the app doesn't work as a companion

### 1. Tasks chat is completely hidden
**File:** `frontend/src/pages/Tasks.jsx` line 983
**What's wrong:** `{false && groups.length > 0 && (` — the entire "ask pebble" chat section on the Tasks page is disabled with a hardcoded `false`. You can't talk to Pebble from Tasks at all.
**Fix:** Change `{false &&` to `{groups.length > 0 &&`

### 2. Documents page sends wrong field name to /api/chat
**File:** `frontend/src/pages/Documents.jsx` line 427
**What's wrong:** The Documents Q&A `chatStream` call sends `page: 'documents'` but the backend `ChatRequest` model expects `current_page`. The backend default is `'home'`, so Pebble always thinks you're on the Home page when you're asking about a document.
**Fix:** Change `page: 'documents'` → `current_page: 'documents'`

### 3. Chapter 5 stale seed data
**What's wrong:** Cosmos DB has old hallucinated tasks referencing "Chapter 5" from early testing. Pebble sees these in Block 9 of the system prompt and references tasks the user never created.
**Fix:** With backend running: `curl -s -X POST http://localhost:8000/api/tasks -H "Content-Type: application/json" -H "X-User-Id: diego" -d '{"groups": []}'`

---

## 🟡 HIGH — Breaks the Pebble companion story

### 4. Documents "turn into tasks" uses raw filename as group name
**File:** `frontend/src/pages/Documents.jsx` line 391
**What's wrong:** When action items already exist from decompose, it calls `dispatch(tasksActions.addGroup({ name: fallbackName, ... }))` where `fallbackName = docName || 'Document'`. For uploaded files this becomes the raw filename like "lecture_notes.pdf".
**Fix:** Store the `res.group_name` from the initial decompose call and use it here, falling back to `docName` only if empty.

### 5. Cross-page companion flow is disconnected
**What's wrong:** Each page has its own isolated chat thread. When you go from Home → Documents → Tasks, Pebble has no memory of what you did on the previous pages within that session. The conversation doesn't follow you.
**Why this is hard:** Each page's chat only passes its own `qaMessages` as history. There's no shared session thread.
**Partial fix already in place:** The backend DOES read your Cosmos tasks and documents on every chat call (blocks 8+9), so Pebble knows your content. It just doesn't know your recent cross-page actions.
**Best fix for demo:** Make sure Home chat can see recent Documents interactions by passing the right page context and ensuring conversation history is saved to Cosmos from all pages.

### 6. Documents Q&A doesn't save conversation to Cosmos
**File:** `frontend/src/pages/Documents.jsx`
**What's wrong:** The Home chat saves every message to Cosmos via `/api/chat` backend (which persists automatically). The Documents Q&A also calls `chatStream` but because it uses a local `qaMessages` array, those messages are isolated and lost on refresh.
**Fix:** This is actually handled by the backend — `/api/chat` already persists messages to Cosmos. The issue is the frontend doesn't reload those messages on mount. For the demo, the backend persistence means Pebble's memory is maintained even if the Documents thread resets visually.

---

## 🟡 MEDIUM — Visible during demo, should be fixed

### 7. "Coming soon" items still in More menu
**File:** `frontend/src/pages/Tasks.jsx`
**What's wrong:** Check if "Move to group" or "Merge with another" placeholders are still visible. These were supposed to be removed in Session 6.
**Fix:** Verify by reading the MoreMenu component and removing any unbuilt items.

### 8. Focus Mode quote rotation speed
**File:** `frontend/src/pages/FocusMode.jsx`
**What's wrong:** Motivational quotes may be changing too frequently (on every render cycle or button click) instead of on a slow 30-60 second timer.
**Fix:** Add a `setInterval` in StandaloneFocus that rotates the quote every 45 seconds.

### 9. Visual gaps found during live testing
**What's wrong:** Diego is seeing things in the live app that look flat, broken, or inconsistent with the Pebble brand. These will be documented as Diego uses the app and reports them.
**Fix:** Address each one as reported.

---

## 🟢 DEPLOYMENT — Required before demo video

### 10. Azure App Service deployment
**What's needed:**
- Backend: containerize or deploy Python FastAPI to Azure App Service
- Frontend: build and deploy React app (or host on Azure Static Web Apps)
- Environment variables: all secrets from `.env` need to be in App Service config
- CORS: backend needs to allow the App Service frontend URL
**Why it matters:** Demo video needs a live URL. Judges need to see it running, not localhost.

---

## About the AI — what you can and can't change

### What lives in the code (you control 100%)
Everything about how Pebble thinks, responds, and behaves is in two files:

**`backend/chat_service.py`** — the 12-block system prompt:
- Block 1: Pebble's identity, voice rules, 7 nevers, 6 always
- Block 2: User preferences (name, comm style, reading level, granularity)
- Block 3: Long-term memories from Cosmos
- Block 4: Learned patterns
- Block 5: Time context (time of day, day of week)
- Block 6: Emotional signals detected in the message
- Block 7: Last 20 conversation turns
- Block 8: User's documents (summaries)
- Block 9: User's tasks (current state)
- Block 10: Current page
- Block 11: Safety rules
- Block 12: Response format rules (lowercase, 1 question, 3 items max, ###ACTIONS)

**`backend/ai_service.py`** — other AI endpoints:
- `_DECOMPOSER_SYSTEM`: how tasks are broken down
- `_SUMMARISE_SYSTEM`: how documents are simplified
- `_NUDGE_SYSTEM`: how nudges are worded
- Temperature settings: 0.2 for decompose (consistent), 0.3 for summarise, lower for factual

### What you can change in the Azure portal
Go to **Azure OpenAI Studio** (oai.azure.com) → your resource:

1. **Model version**: Check which GPT-4o version is deployed. `gpt-4o-2024-11-20` is the latest and best. If you're on an older version, update it.

2. **Content filters**: Azure has its own content filtering layer on top of our code's content safety. If Pebble is refusing things it shouldn't, the Azure content filters might be too aggressive. You can adjust filter thresholds in "Content filters" under your deployment.

3. **Rate limits / TPM**: If responses are slow or timing out, check your Tokens Per Minute limit for the deployment. For a demo you want it maxed out.

4. **Model temperature in portal**: The portal lets you test in the playground — useful for testing prompts before putting them in code.

### What you CANNOT change
- The base model behavior (you can't fine-tune GPT-4o on Azure OpenAI without a custom fine-tuning job, which takes days and costs money — not worth it for this deadline)
- The model's knowledge cutoff
- How the model handles very long contexts

### The most impactful AI improvement you can make right now
The single biggest improvement is **making sure Pebble's context blocks are fully populated**:
- Block 9 (tasks) only helps if tasks are actually in Cosmos — fix the seed data first
- Block 8 (documents) only helps if documents are uploaded — make sure upload saves metadata
- Block 3 (memories) — the `get_user_memory` Cosmos call — verify this is actually storing and retrieving

The personality is already well-engineered. The gap is the context data feeding into it.

---

## 5-Day Plan (March 22–26)

### Today (March 22)
1. Fix Tasks chat hidden line (5 min)
2. Fix Documents `page:` field name (2 min)
3. Fix Documents group name (10 min)
4. Clear Chapter 5 seed data (2 min)
5. Verify "Coming soon" items removed from More menu
6. Use the app live — Diego reports what still feels broken

### March 23
1. Fix everything Diego found while using the app
2. Azure App Service deployment (biggest time investment)

### March 24
1. Buffer for deployment issues
2. README update

### March 25
1. Demo video recording (requires live URL)
2. PowerPoint deck

### March 26
1. Fix anything the demo video reveals
2. Final GitHub cleanup
3. Submit
