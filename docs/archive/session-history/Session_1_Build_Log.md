# First Claude Code Session — Setup & Auth Removal

Read the CLAUDE.md file in this repo first. It has the full project context, architecture, and constraints.

Then execute the following tasks IN ORDER. After each task, verify the changes work before moving to the next.

---

## Task 1: Restructure the repo into proper folders

The repo currently has all files flat in the root. Reorganize into this structure:

**Move these to `backend/`:**
- main.py
- ai_service.py
- config.py
- db.py
- models.py
- auth.py (will be deleted in Task 2, but move it first)

**Move these to `frontend/src/`:**
- App.jsx
- main.jsx
- store.js

**Move to `frontend/src/components/`:**
- components/Decomposer.jsx
- components/PreferenceDashboard.jsx  
- components/Refactor.jsx
- components/TimerRing.jsx
(Remove the duplicate JSX files from root if they exist — the ones in components/ are the correct versions)

**Move to `frontend/src/utils/`:**
- utils/api.js
- utils/bionic.jsx

**Move to `frontend/src/styles/`:**
- styles/global.css

**Move to `frontend/` (root of frontend):**
- index.html
- package.json
- package-lock.json
- vite.config.js
- authConfig.js (will be deleted in Task 2)

**Move to `infra/`:**
- neurofocus.bicep

**Keep in repo root:**
- README.md
- .gitignore

**Create these empty files:**
- backend/requirements.txt (populate with the dependencies from CLAUDE.md)
- backend/.env.example

After restructuring, update ALL import paths in frontend files to match the new structure. Update vite.config.js if needed. The frontend entry point in index.html should point to `src/main.jsx`.

---

## Task 2: Remove Azure AD / MSAL authentication

This is critical. The app currently requires Azure AD tokens which we don't have set up. Replace with simple user profile identification.

### Backend changes:

**Delete `backend/auth.py` entirely.**

**In `backend/main.py`:**
- Remove the import of `get_user_id` from `auth`
- Add this simple dependency at the top of the file:

```python
from fastapi import Header

async def get_user_id(x_user_id: str = Header(default="default-user")) -> str:
    return x_user_id
```

- All endpoints that use `Depends(get_user_id)` stay the same — they'll now read from the header instead of validating Azure AD tokens

**In `backend/config.py`:**
- Remove these fields from the Settings class: `azure_tenant_id`, `azure_client_id`, `azure_client_secret`
- Remove `secret_key` field (was for auth sessions)

### Frontend changes:

**Delete `frontend/authConfig.js` entirely (or `frontend/src/authConfig.js` after restructure).**

**In `frontend/package.json`:**
- Remove `@azure/msal-browser` and `@azure/msal-react` from dependencies

**In `frontend/src/main.jsx`:**
- Remove the MsalProvider wrapper. It should just be:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './store'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
)
```

**In `frontend/src/App.jsx`:**
- Remove all MSAL imports (`useMsal`, `useIsAuthenticated`, `loginRequest`, `DEBUG_MODE`)
- Remove the `LoginScreen` component entirely
- Remove the `isAuthenticated` check — the app should render directly
- Remove the "Sign out" button from the sidebar
- Remove `const { instance } = useMsal()`
- The app should just load with the main shell immediately — no login screen

**In `frontend/src/utils/api.js`:**
- Remove any Bearer token / MSAL token acquisition logic
- All API calls should send an `X-User-Id` header instead. Use a simple constant or let the user pick a profile name. For now default to "default-user":

```javascript
const USER_ID = 'default-user'

// Add this header to all fetch calls:
headers: {
  'Content-Type': 'application/json',
  'X-User-Id': USER_ID,
}
```

- For the SSE streaming endpoint (summarise), make sure the X-User-Id header is included in the fetch request too

After this task: `npm install` in frontend to update the lock file without MSAL packages. The app should load without any login screen and all API calls should work with the X-User-Id header.

---

## Task 3: Create backend/.env.example

Create a template showing all required environment variables (no real values):

```
# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-key-here
AZURE_OPENAI_DEPLOYMENT_GPT4O=gpt-4o
AZURE_OPENAI_API_VERSION=2024-02-01

# Azure Cosmos DB
COSMOS_ENDPOINT=https://your-account.documents.azure.com:443/
COSMOS_KEY=your-key-here
COSMOS_DATABASE=neurofocus

# Azure Content Safety (to be added)
# CONTENT_SAFETY_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
# CONTENT_SAFETY_KEY=your-key-here

# Azure Blob Storage (to be added)
# BLOB_CONNECTION_STRING=your-connection-string
# BLOB_CONTAINER_NAME=documents

# Azure Document Intelligence (to be added)
# DOC_INTELLIGENCE_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
# DOC_INTELLIGENCE_KEY=your-key-here

# App
ALLOWED_ORIGINS=http://localhost:5173
```

---

## Task 4: Update .gitignore

Make sure .gitignore includes:
```
# Python
__pycache__/
*.pyc
.env
venv/
.venv/

# Node
node_modules/
dist/
.env.local

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Azure
.azure/
```

---

## Task 5: Verify everything works

After all changes:
1. Check that no import errors exist by reviewing all import paths
2. The frontend should load without a login screen
3. All API endpoints should accept X-User-Id header instead of Bearer tokens
4. No references to MSAL, Azure AD, auth.py, or authConfig.js remain anywhere in the codebase

---

## IMPORTANT RULES:
- Do NOT add Azure AD/MSAL back under any circumstances
- Do NOT use GPT-4-32k — only GPT-4o deployment
- Keep all error messages calm and supportive
- Preserve all existing accessibility features (ARIA labels, keyboard nav, focus-visible)
- Do NOT modify the core AI prompts in ai_service.py — those are already good
- After completing all tasks, show me the updated file tree so I can verify the structure
