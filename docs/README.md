# NeuroFocus — Project Documents

This folder contains the foundational planning and vision documents created before and during the build. They show the thinking behind every architectural and product decision in this repo.

---

## Documents

### [NeuroFocus_Product_Vision.docx](NeuroFocus_Product_Vision.docx)
**What it is:** The executive product vision document written at the start of the hackathon.

**What's in it:** The core problem statement (cognitive overload in neurodiverse users), the product identity and design philosophy ("calm, not clinical"), the five-page app structure, the visual design system, and the Responsible AI principles that govern every AI interaction. This document is the single source of truth for *why* design and UX decisions were made.

**Why we wrote it:** We wanted every technical decision — prompt engineering, UI layout, error message tone, font choices — to trace back to a human need. This doc is that anchor.

---

### [NeuroFocus_Project_Plan.docx](NeuroFocus_Project_Plan.docx)
**What it is:** The technical project plan and architecture spec written for the Microsoft Innovation Challenge.

**What's in it:** The full 8-service Azure architecture, the team split (backend / frontend), the three core features with detailed specs, the API contract between frontend and backend, the Responsible AI implementation plan (Content Safety layers, explainability, calm tone policy), and the deployment strategy.

**Why we wrote it:** To align the team on scope and technical approach before writing a line of code, and to ensure every Azure service we use has a clear, justified purpose — not just breadth for breadth's sake.

---

### [Session_1_Build_Log.md](Session_1_Build_Log.md)
**What it is:** The task checklist from the first build session — repo restructure and MSAL auth removal.

**What's in it:** Step-by-step instructions for reorganizing the flat repo into `backend/`, `frontend/`, `infra/` folders and replacing Azure AD / MSAL authentication with a lightweight `X-User-Id` header for the hackathon demo.

**Why we wrote it:** Hackathon judges need to open the app without a Microsoft account. MSAL required an Azure AD tenant and app registration that judges wouldn't have. This doc captures the decision and the exact steps taken so it's reproducible and auditable.

---

## How These Connect to the Code

The vision doc → drives `ai_service.py` system prompts, UI component design, and Responsible AI policy in `content_safety.py`.

The project plan → drives `main.py` API structure, `config.py` service configuration, and the Azure service integration in `blob_service.py`, `doc_intelligence.py`, `monitoring.py`, and `keyvault.py`.

The build log → documents the auth architecture decision that's reflected in the `X-User-Id` header pattern throughout `main.py`.
