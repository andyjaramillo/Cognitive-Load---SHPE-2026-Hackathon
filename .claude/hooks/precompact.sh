#!/bin/bash
# Pebble PreCompact Hook — fires when Claude Code compresses conversation context
# Writes a compact state snapshot so the next Claude session picks up where we left off

SNAPSHOT_FILE=".claude/session-snapshot.md"

cat > "$SNAPSHOT_FILE" << 'SNAPSHOT'
# Pebble Session Snapshot — Auto-Generated
## Project: Pebble. AI Cognitive Companion (Hackathon, deadline March 27 2026)
## Stack: FastAPI backend (port 8000) + React/Vite frontend (port 5173)
## Proxying: frontend /api/* → localhost:8000 (vite.config.js)
## User ID: all API calls use header X-User-Id: diego

## What is WORKING
- All backend routes /api/preferences, /api/chat (SSE), /api/tasks, /api/upload, /api/sessions
- Home page: SSE chat, greeting dedupe (sessionStorage), quick actions
- Tasks page: accordion UI (NOT synced to Cosmos yet)
- Documents page: upload works (David's fix), no saved docs browser
- Focus Mode: 6 states, circular timer
- Onboarding: 11-stage, saves to Cosmos

## What is BROKEN / MISSING
- Settings page: stub only
- Chat history: lost on refresh (no GET /api/conversations endpoint)
- Tasks: not persisted to Cosmos (loadTasks/saveTasks exist in api.js, just not called)
- Documents: no "Your documents" browser section
- Fonts: Lexend/Atkinson/OpenDyslexic not loaded in index.html (onboarding preview broken)
- Post-onboarding walkthrough: WalkthroughOverlay.jsx not built

## Key Files
- backend/main.py — all routes
- backend/chat_service.py — 12-block Pebble personality, SSE streaming
- frontend/src/pages/Home.jsx — SSE chat
- frontend/src/pages/Tasks.jsx — task accordion
- frontend/src/pages/Documents.jsx — upload + 3 states
- frontend/src/styles/global.css — ALL design tokens, 4 themes
- frontend/src/utils/api.js — all API utilities

## Skills Installed
- ~/.claude/skills/frontend-design/SKILL.md — design mindset, Pebble aesthetics
- ~/.claude/skills/pebble-gotcha/SKILL.md — Pebble-specific anti-patterns
- .claude/skills/ui-ux-pro-max/ — 67 styles, 96 palettes, 57 font pairings
SNAPSHOT

echo "Context snapshot written to $SNAPSHOT_FILE"
