# Pebble Color System — Add this to CLAUDE.md under Visual Design

## Color Meaning System (STRICT — never deviate)

Every color in the app has ONE meaning. This is not decorative — it's a communication system for neurodiverse users who rely on color consistency to reduce cognitive load.

### Green — completion and safety
"You did it. You're safe. This is done."
- Done status chips
- Completed task dots
- "Good" energy check-in button
- Success confirmations ("Preferences saved")
- Morning: #58A078 (soft sage) / Afternoon: #50946A (confident green) / Evening: #528C64 (muted forest) / Night: #50A86E glow text #60C888

### Teal — active and primary actions
"You're here. This is what you're working on. Click me to do something."
- Primary action buttons (Start focus, I have a document, Simplify, Break it down)
- "Working on it" status chips
- Active task highlight
- Active navigation item
- Morning: #5A9AA4 (airy ocean) / Afternoon: #2A7A90 (confident marine) / Evening: #3A7E8E (deep dusk teal) / Night: #44A0AE glow text #60BCC8

### Sky blue — upcoming and queued
"This is waiting for you. No rush. It'll be here when you're ready."
- "Up next" status chips
- Upcoming task dots
- Queued items
- NEVER used for actions or urgency
- Morning: #6892B0 / Afternoon: #6A96B8 / Evening: #6488A8 / Night: #6A8AB4 glow text #80B0D8

### Lilac/purple — paused and reflective
"This is resting. You chose to pause it. No judgment."
- "Paused" status chips
- Paused task dots
- "Overwhelmed" energy check-in button
- Deferred or skipped items
- NEVER used for errors or warnings
- Morning: #9686AE / Afternoon: #9A88B4 / Evening: #8A78A4 / Night: #8A78AE glow text #B0A0CC

### Soft orange — AI companion voice
"The AI is gently talking to you. A suggestion, a nudge, a check-in."
- AI motivational nudges between tasks
- AI follow-up suggestions ("Want me to turn these into tasks?")
- Energy check-in prompt container
- "Getting tired" energy button
- Onboarding question highlights
- Notification-style moments ("Preference saved")
- NEVER on status indicators
- NEVER on primary action buttons
- NEVER on errors
- Morning: #DCA05A / Afternoon: #E0A060 / Evening: #C89450 / Night: #C8A046 glow text #D8C060

### Neutral warm gray — unfilled and inactive
"This exists but doesn't need your attention right now."
- Unfilled task checkbox borders
- Inactive navigation items
- Placeholder text
- Disabled buttons
- Ghost button borders
- Consistent across all times: #B4AA9A range for dots, rgba(180,170,155) for backgrounds

### Text colors
- Primary text (headings, task names, body): Dark warm charcoal. Morning: #3A3024 / Afternoon: #2A2622 / Evening: #2E2828 / Night: #DCD4DA
- Secondary text (descriptions, subtitles): Morning: #8A7860 / Afternoon: #7A7060 / Evening: #7A6E70 / Night: #A098A4
- Muted text (timestamps, labels): Morning: #8A7860 at 55% opacity / Afternoon: #8A7E6E / Evening: #7A6E70 at 80% / Night: #6A5E6E

## NEVER use these colors anywhere:
- Pure red (#FF0000 or similar) — alarming, triggers anxiety
- Bright yellow (#FFFF00 or similar) — overwhelming, harsh
- Pure black (#000000) backgrounds — too stark (use warm dark charcoals for night)
- Pure white (#FFFFFF) backgrounds — too harsh for extended reading (use cream/warm off-whites)
- Any neon or saturated color — overstimulating

## Four Time-of-Day Themes

### Morning (6am-12pm): peach sunrise
Background: radial-gradient(ellipse at 50% 38%, #FFF8F2 0%, #F8F0E8 18%, #F4EBE4 34%, #F0E6E0 50%, #EDE2DC 68%, #F0E6E0 85%, #F2E8E2 100%)
Card background: rgba(255,253,250,0.58) with border rgba(226,214,202,0.35)
Input background: rgba(255,253,250,0.35) with border rgba(216,204,192,0.35)
Vibe: Soft peachy cream. Dispersed warmth. Sand at first light.

### Afternoon (12pm-5pm): warm coast
Background: radial-gradient(ellipse at 50% 40%, #FFFAF5 0%, #F5EDE4 35%, #EAE4DC 65%, #F0EBE5 100%)
Card background: rgba(255,255,255,0.68) with border rgba(218,208,196,0.4)
Input background: rgba(255,255,255,0.42) with border rgba(200,190,178,0.4)
Vibe: Full 1E palette. Peak clarity. Salmon warmth in background only, never on status.

### Evening (5pm-9pm): warm dusk
Background: radial-gradient(ellipse at 50% 42%, #F6F0EE 0%, #F0E8E6 18%, #EAE2E0 34%, #E6DCDA 50%, #E2D8D8 68%, #E6E0DE 85%, #E8E2E0 100%)
Card background: rgba(255,252,250,0.55) with border rgba(214,206,204,0.35)
Input background: rgba(255,252,250,0.32) with border rgba(204,196,194,0.35)
Vibe: Warm rosy cream cooling down. Afternoon fading gently. No purple in background.

### Night (9pm-6am): deep ocean
Background: radial-gradient(ellipse at 50% 46%, #2C2434 0%, #241E2C 25%, #201A26 45%, #1C1822 65%, #1E1A22 85%, #201C24 100%)
Card background: rgba(40,34,48,0.7) with border rgba(80,70,90,0.45)
Input background: rgba(32,26,38,0.5) with border rgba(80,70,90,0.4)
Vibe: Rich purple-dark. All accent colors brighten to glow. Alive in the dark.

## Time Detection (JavaScript)
```javascript
function getTimeTheme() {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}
```
Set as data-theme attribute on root element. Transition between themes with 2s ease on background, 0.5s ease on all other color properties. User can override in Settings.
