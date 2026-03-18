# NeuroFocus — Full Project Audit
## March 18, 2026 — Day 3 of 11

---

## PART 1: WHERE WE ARE

### What exists right now:

**Backend (COMPLETE):**
- 11 Python files, all written and tested
- 8 Azure services integrated in code
- 7 Azure services provisioned and connected (Key Vault not provisioned separately but built into code)
- Backend runs locally, responds to /health
- API endpoints: /preferences, /decompose, /summarise, /explain, /nudge, /upload, /sessions

**Frontend (IN PROGRESS — Sessions 1-4 sent to Claude Code):**
- Session 1: App shell, top nav, routing, time-of-day themes — BUILT
- Session 2: Documents page — BUILT
- Session 3: Tasks page — BUILT  
- Session 4: Focus Mode — IN PROGRESS or BUILT
- Session 5: Home page + AI chat + onboarding — NOT STARTED
- Session 6: Settings + polish — NOT STARTED

**Azure (PROVISIONED):**
- Azure OpenAI with GPT-4o deployed (via Foundry)
- Cosmos DB (serverless)
- Blob Storage
- Document Intelligence
- Content Safety
- Application Insights — NOT provisioned
- Key Vault — NOT provisioned separately
- App Service — NOT deployed

**Documents created:**
- CLAUDE.md (v4 with full color system)
- Executive Vision v2 document
- Team Meeting Talking Points
- AI Capabilities Map (19 capabilities)
- Tasks Spec
- Session prompts 1-4
- Color system spec

---

## PART 2: JUDGING CRITERIA SCORECARD (honest assessment)

### Performance (25%) — How well does it work?
**Current score: 6/10**

Strengths:
- Backend is solid and complete
- Real Azure services connected
- Streaming responses for document simplification
- Content Safety with custom cognitive pressure detection

Weaknesses:
- Frontend has known bugs (enter key not submitting, home page send button not working)
- No polish pass done yet
- Backend and frontend not fully tested together end-to-end
- No error handling tested in the UI
- App not deployed to Azure App Service — still localhost only

To improve:
- Session 6 polish pass is critical
- Need end-to-end testing of every flow
- Deploy to App Service before recording demo video
- Fix all known bugs

### Innovation (25%) — Is the approach creative?
**Current score: 8/10**

Strengths:
- Time-of-day adaptive theming (no other team will have this)
- Custom cognitive pressure detection (7 categories specific to neurodiverse users)
- Overwhelm escape hatch (strips to one micro-task)
- Conversational document processing (no tabs, AI asks one guided question)
- Energy check-in in Focus Mode
- Breathing guide on breaks
- "Just tell me what I need to DO" extraction from documents
- Task groups that flow from documents automatically
- Color system where every color has a strict meaning tied to neurodiversity

Weaknesses:
- The AI chat on the home page (Session 5) isn't built yet — this is the first thing judges see
- The conversational onboarding isn't built yet — this is the "personalization" story
- No ambient sound option (discussed but cut)

To improve:
- Session 5 (Home + Chat + Onboarding) is the most important remaining session for innovation scoring
- The onboarding flow IS the innovation demo moment — it shows the AI adapting in real-time

### Breadth of Azure Services (25%) — How many services meaningfully integrated?
**Current score: 7/10**

Currently using (7 services):
1. Azure OpenAI (GPT-4o) — all AI
2. Azure Cosmos DB — preferences, sessions
3. Azure Blob Storage — document archival
4. Azure AI Document Intelligence — PDF/Word extraction
5. Azure AI Content Safety — input/output screening
6. Azure Monitor / App Insights — observability (code exists, resource not provisioned)
7. Azure AI Foundry — project management layer

NOT yet using but planned:
8. Azure App Service — deployment (not done)
9. Azure Key Vault — secrets (code exists, not provisioned separately)

To improve:
- Provision Application Insights and verify telemetry flows
- Deploy to App Service (this adds a real service to the count AND makes the demo look professional)
- Key Vault can be set up when deploying to App Service with Managed Identity
- Could add Azure Static Web Apps for frontend hosting (easy, adds one more service)

### Responsible AI (25%) — Safety, fairness, transparency
**Current score: 9/10**

Strengths:
- Two-layer content safety (Azure API + custom cognitive pressure regex with 7 categories)
- Context-aware screening (documents screened differently than user intent)
- Every AI output screened before reaching the user
- Calm error handling (200 status with gentle messages, never error codes)
- Explainability feature (hover tooltips showing WHY text was simplified)
- Guided choices prevent open-ended confusion
- No gamification (prevents anxiety)
- No red colors (prevents alarm)
- Overwhelm escape hatch (safety valve for peak cognitive overload)
- Energy check-in (proactive wellbeing check)
- "You did something. That counts." validation language

Weaknesses:
- Explainability tooltips not visually tested yet
- The Content Safety flagged response UI hasn't been verified in the frontend
- No explicit Responsible AI section in the README yet

To improve:
- Add a "Responsible AI" section to the README explaining the approach
- Verify Content Safety flagged responses display correctly in the UI
- Add this to the PowerPoint: "We didn't add Responsible AI as an afterthought. The responsible AI practices ARE the product."

---

## PART 3: NEURODIVERSITY BEST PRACTICES AUDIT

Based on research from current UX literature on neurodiverse design:

### What we're doing RIGHT (aligned with best practices):

1. FLEXIBILITY: Users control fonts, spacing, themes, reading level, granularity — all adjustable
2. GRADUAL COMPLEXITY: Information revealed progressively (collapsed task groups, one active task, AI asks before showing results)
3. PREDICTABLE PATTERNS: Consistent color meanings, same layout patterns, smooth transitions
4. SENSORY SENSITIVITY: No red, no flashing, no spinning, soft transitions, warm colors, breathing animations
5. COGNITIVE SUPPORT: Clear instructions, guided choices, immediate feedback, error prevention
6. USER CONTROL: Override themes, adjust preferences anytime, skip tasks, exit Focus Mode, escape hatch
7. PLAIN LANGUAGE: AI writes in calm, simple language at the user's preferred level
8. REDUCED DECISION LOAD: AI chooses what to show based on preferences, one guided question instead of many tabs

### What we're MISSING (gaps compared to best practices):

1. REDUCED MOTION OPTION: We have lots of animations (staggered entrance, slide transitions, breathing guide). Some neurodiverse users are sensitive to motion. We need a "Reduce motion" toggle in Settings that disables animations and uses simple fades or no animation. THIS IS A WCAG REQUIREMENT (prefers-reduced-motion).

2. KEYBOARD NAVIGATION: We haven't specified or tested keyboard accessibility. Tab order, focus indicators, Enter to submit, Escape to close. Neurodiverse users who struggle with fine motor control may rely on keyboard navigation.

3. SCREEN READER COMPATIBILITY: No ARIA labels specified in any session prompt. Buttons, inputs, and interactive elements need proper ARIA labels for assistive technology.

4. TEXT-TO-SPEECH: We offer Bionic Reading but no text-to-speech option for users who process information better through audio. This could be a future feature mention.

5. SAVE AND RESUME: If the user closes the browser mid-task, can they come back and pick up where they left off? Session persistence beyond the current browser session. Cosmos DB stores sessions but we haven't built the "resume" flow in the UI.

6. UNDO ACTIONS: If a user accidentally marks a task as done, can they undo it? No undo is specified. Neurodiverse users are more likely to make accidental taps.

7. CUSTOMIZABLE AI PERSONALITY: The AI has one tone (calm, warm). Some neurodiverse users might prefer more direct, less emotional language. A "communication style" preference (warm vs. direct vs. minimal) would add depth.

---

## PART 4: WHAT'S MISSING FOR A COMPLETE SUBMISSION

### Must-have before March 27:

1. SESSION 5: Home page with AI chat and conversational onboarding — THIS IS THE FIRST THING JUDGES SEE. Without it, the app opens to a placeholder. This is the #1 priority.

2. SESSION 6: Settings page + polish pass — fix all bugs, smooth all transitions, verify all themes.

3. DEPLOY TO APP SERVICE: The demo video must show the app running on a real Azure URL, not localhost. This also adds App Service to the Azure breadth count.

4. DEMO VIDEO: Pre-recorded, showing the full user journey. This is what judges actually watch. Script it, record it on the deployed URL, narrate it well.

5. POWERPOINT DECK: Architecture diagram, problem statement, approach, key learnings.

6. README: With screenshots, architecture diagram, setup instructions, Responsible AI section.

7. PUBLIC GITHUB REPO: Verify it's public and clean.

### Nice-to-have if time allows:

8. Reduce motion toggle in Settings
9. Keyboard navigation pass
10. ARIA labels on interactive elements
11. Key Vault provisioned with Managed Identity on App Service
12. Application Insights provisioned and telemetry verified
13. Undo action on task completion
14. "Resume where you left off" flow for returning users

---

## PART 5: TIMELINE REALITY CHECK

### Days remaining: 9 (March 18-27, submission March 27)

### What needs to happen:

Day 3 (TODAY March 18):
- Finish Session 4 (Focus Mode) if not done
- Start Session 5 (Home + Chat + Onboarding) — most critical remaining session
- Verify backend + frontend connected end-to-end

Days 4-5 (March 19-20):
- Complete Session 5
- Start Session 6 (Settings + polish)
- Fix all known bugs
- Test every flow end-to-end

Days 6-7 (March 21-22):
- Deploy to Azure App Service
- Provision remaining services (App Insights, Key Vault if using Managed Identity)
- Final polish and bug fixes
- Write README with screenshots

Days 8-9 (March 23-24):
- Script the demo video
- Record demo video on deployed URL
- Build PowerPoint deck

Day 10 (March 25):
- Final review of all deliverables
- Team review (if teammates contribute)

Day 11 (March 26-27):
- Buffer day
- Submit

### Honest risk assessment:

- You're building a 5-page app with real AI integration essentially solo. That's ambitious but you've proven you can move fast.
- Session 5 (Home + Chat + Onboarding) is the highest risk item because it requires building /api/chat which doesn't exist in the backend yet.
- If you run out of time, the demo video script can compensate by showing the best flows you DO have working.
- Deploy early (Day 6) so you have time to catch deployment-specific bugs.

---

## PART 6: RECOMMENDATIONS (prioritized)

### Do these TODAY:
1. Verify Session 4 is working correctly
2. Start Session 5 — write the prompt with me, include the /api/chat backend endpoint
3. Test the Documents page end-to-end with a real PDF upload

### Do this week:
4. Complete Session 5 and 6
5. Add "Reduce motion" toggle to Settings (prefers-reduced-motion CSS)
6. Deploy to App Service
7. Write README

### Do before submission:
8. Record demo video
9. Build PowerPoint
10. Final bug fixes

### Do if time allows:
11. ARIA labels
12. Keyboard navigation
13. Undo on task completion
14. Additional AI capabilities from the 19-capability map

---

## PART 7: WHAT I'D CHANGE IF STARTING OVER (honest reflection)

1. The color system and design exploration took significant time. It was worth it for the quality but in a hackathon, shipping beats perfection. The design is now locked — don't reopen it.

2. The 5-page structure is ambitious for a solo builder. If I were starting fresh, I might have done 3 pages (Home, Documents+Tasks combined, Focus Mode) with deeper functionality instead of 5 pages with some features still shallow.

3. Foundry vs direct OpenAI — we went back and forth on this. The current setup (Foundry project with direct API key) works and gives you the Foundry story for judges. Don't change this again.

4. The Sessions approach (6 separate Claude Code sessions) creates integration risk — each session builds independently and they might not connect perfectly. The polish session (Session 6) needs to specifically address cross-page integration issues.

5. The backend was built before the frontend design was finalized. Some endpoints may need adjustments to match what the frontend actually needs (especially /api/chat which doesn't exist yet).

---

## PART 8: COMPETITIVE EDGE SUMMARY

What makes NeuroFocus different from what other teams will build:

1. It's not a chatbot that happens to be accessible. It's an accessibility tool that happens to use AI.
2. Custom cognitive pressure detection (7 categories) — no one else will have domain-specific content safety.
3. Time-of-day adaptive theming — no one else will have this.
4. The overwhelm escape hatch — a genuine safety feature, not a gimmick.
5. Document-to-task pipeline — the full journey from "this 12-page PDF is overwhelming" to "I finished all 4 tasks."
6. The Responsible AI story isn't an add-on — it IS the product.
7. The color system has intentional meaning — judges who notice this will appreciate the thoughtfulness.
