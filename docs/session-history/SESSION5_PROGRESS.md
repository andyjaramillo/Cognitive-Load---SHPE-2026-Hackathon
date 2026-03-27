# Session 5 Progress — All Locked Decisions
## Saved March 18, 2026

---

## PEBBLE BRAND IDENTITY (LOCKED)

### Logo
- Font: DM Serif Display
- Text color: Pure black #1A1A1A
- Letter spacing: +0.2px
- Dot: Ocean sage #5A8A80, circle element at baseline (not elevated)
- Night mode: White dot #DCD4DA, light text #DCD4DA

### Subtitle (hero/marketing only, NOT in nav)
- Text: "a calm place to start" (lowercase, no period at end)
- Font: Inter Light (weight 300)
- Color: #7A7670 (visibility level B)
- Letter spacing: 1px
- Centered under the name

### Nav
- Just "Pebble●" — NO subtitle in the nav
- Dot is the ocean sage circle at baseline

### Implementation timing
- Codename stays "neurofocus" in all code, folder names, Azure resources
- Display name changes to "Pebble." in Session 6 (polish pass)
- Only change: TopNav text, AI greeting references, README

### Brand document
- Full brand rationale saved at /mnt/user-data/outputs/PEBBLE_BRAND.md

---

## SESSION 5: HOME PAGE + ONBOARDING + CHAT

### Part 1: Returning User Home Page (LOCKED)

**Layout:** Same as current build — centered greeting, buttons, input. No sidebar, no history panel.

**Greeting:** AI-generated, contextual, warm. Uses name + time of day. NOT always "What would you like to work on?" Examples:
- "Good afternoon, Diego. You've got a few things going on, but none of them are urgent. What feels right?"
- "Morning, Diego. Fresh start today. One thing at a time."
- "Hey Diego. You finished a lot yesterday. No pressure to match it."
- "Evening, Diego. Winding down? If you want to plan something small for tomorrow, I'm here."

**Special cases:**
- If user left mid-Focus-Mode < 24 hours ago: greeting mentions it, "Start focus mode" button changes to "Resume focus mode"
- If user hasn't visited in 3+ days: "It's been a few days. No pressure — what feels right today?"
- If it's after 10pm: AI suggests planning for tomorrow instead of starting now

**Three quick action buttons:**
- "I have a document" (teal tint)
- "Break down a task" (orange tint)
- "Start focus mode" / "Resume focus mode" (green tint)
- Buttons have tiny descriptions on hover (not intrusive, clean, minimal)

**"What was I working on?" link:**
- Small lilac text below the quick action buttons
- Tapping triggers the AI to show recent sessions inline in the chat
- Approach C — the history lives in the chat, triggered by this link

**Chat input:**
- Placeholder rotates: "What's on your mind?" / "Paste something overwhelming..." / "Tell me what you need help with..." / "Or just say hi."
- Small arrow to submit
- No chatbot in Focus Mode (Focus is for focusing)

**Quality of life features:**
- AI greeting rotates and is contextual (never the same generic message)
- Chat placeholder rotates
- Quick action button hover descriptions (clean, minimal, not intrusive)
- Late night suggestion (after 10pm)
- 3+ days away acknowledgment

---

### Part 2: New User Onboarding (IN PROGRESS)

**Layout:** Full screen, no nav visible. Centered experience. Feels relaxing and trustworthy.

**Stage 1 entrance (staggered, holds 2-3 seconds, fully fades out):**
- Line 1: "Welcome to Pebble."
- Line 2: "I'm here to make the overwhelming feel smaller."

**Stage 2 (fades in where stage 1 was):**
- "First, who will I be helping?"
- Input field with placeholder "your name" and small arrow
- After submit: "[Name], is that right?" with "That's me" (teal) / "Let me fix that" (neutral)
- After confirm: "Nice to meet you, [Name]. Let me set a few things up so this feels right for you."
- Holds 1.5 seconds, fades to Question 2

**6 onboarding questions (ALL LOCKED):**

1. **Name** ✅
   - Stage 1 (staggered, holds 2-3s, fully fades): "Welcome to Pebble." + "I'm here to make the overwhelming feel smaller."
   - Stage 2 (fades in): "First, who will I be helping?" + input ("your name", small arrow)
   - After submit: "[Name], is that right?" + "That's me" / "Let me fix that"
   - After confirm: "Nice to meet you, [Name]. Let me set a few things up so this feels right for you."

2. **Reading level** ✅
   - Question: "How would you like me to walk you through things?"
   - Choices:
     - "Short and clear. Just the essentials." → simple
     - "A good balance. Enough detail to understand, nothing extra." → standard
     - "Give me everything. I like having the full picture." → detailed
     - "Let me describe what I need." → opens text input
     - "I'm not sure yet." → AI: "No worries. We'll go with a nice balance for now. You can always change it later."
   - Subtle note: "You can change any of these anytime in Settings"

3. **Font** ✅ (moved before theme)
   - Question: "Is there a font that feels easier to read?"
   - Options (each shows live preview, descriptions on hover):
     - **Default (DM Sans)** — listed FIRST
     - **Lexend** — "Easier to read"
     - **Atkinson Hyperlegible** — "Maximum clarity"
     - **OpenDyslexic** — "Designed for dyslexia"
   - Tapping changes all text on screen immediately
   - Subtle note: "You can change this anytime in Settings"

4. **Visual theme** ✅ (THE WOW MOMENT — moved after font)
   - Question: "Choose the space that feels most comfortable."
   - Three preview cards with real UI samples:
     - Warm (cream/peach daytime)
     - Dark (deep ocean night)
     - Match the time of day (shows current theme + four tiny dots for other times)
   - Tapping transforms ENTIRE screen immediately

5. **How they work (granularity)** ✅
   - Question: "When something needs to get done, how should I break it down?"
   - Choices:
     - "Walk me through it step by step. The smaller, the better." → micro
     - "Give me a clear plan. Not too detailed, not too vague." → normal
     - "Just show me the big picture. I'll figure out the rest." → broad
     - "Let me describe what I need." → opens text input
     - "I'm not sure yet." → AI: "No worries. We'll start with a clear plan and you can always ask for more or less detail."

6. **Communication style** ✅
   - Question: "What does helpful sound like to you?"
   - Choices:
     - "Like a deep breath. Warm and reassuring." → warm tone
     - "Like a clear path. Calm and to the point." → direct tone
     - "A little of each." → balanced tone
     - "Let me describe what works." → opens text input
     - "I'll figure it out as I go." → AI: "No worries. We'll start with a little of each and you can adjust anytime."

**After final question:**
- "You're all set, [Name]." + warm closing message
- Nav fades in, transitions to home page
- Preferences saved to Cosmos DB

---

### Part 3: Chat Mechanics + /api/chat Backend

This is how the AI chat works on the home page. When the user types something in the input and hits send, what happens?

**Status: STARTING NOW**

---

## PROJECT AUDIT REFERENCE
- Full audit saved at /mnt/user-data/outputs/PROJECT_AUDIT.md
- Current scores: Performance 6/10, Innovation 8/10, Azure Breadth 7/10, Responsible AI 9/10
- #1 priority: Session 5 (this)
- #1 risk: /api/chat endpoint doesn't exist yet
