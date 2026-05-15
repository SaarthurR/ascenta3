# Chat Identity Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep removed users out of every group, rewrite historical chat sender names after renames, and enforce admin name-freeze in AscentChat.

**Architecture:** Move chat identity maintenance into shared server helpers used by the admin API, then tighten the chat client so the top-right rename control reflects and enforces the `namesLocked` flag. Cover the server behavior with unit tests and the client lock with source-level regression tests.

**Tech Stack:** Vercel serverless API, Firebase Admin Firestore, static HTML chat client, Node test runner

---

### Task 1: Server Test Coverage

**Files:**
- Create: `tests/chat-admin-identity.test.mjs`
- Create: `lib/chat-admin-identity.mjs`
- Modify: `api/admin.js`

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Run targeted tests to verify failure**
- [ ] **Step 3: Implement helper functions for rename backfill and group cleanup**
- [ ] **Step 4: Wire helpers into admin rename/remove routes**
- [ ] **Step 5: Re-run targeted tests to verify pass**

### Task 2: Client Name Freeze Enforcement

**Files:**
- Create: `tests/chat-ui.test.mjs`
- Modify: `chat/index.html`

- [ ] **Step 1: Write failing tests for locked-name UI behavior**
- [ ] **Step 2: Run targeted tests to verify failure**
- [ ] **Step 3: Hide or disable rename affordance when names are locked and guard rename submission**
- [ ] **Step 4: Re-run targeted tests to verify pass**

### Task 3: Final Verification

**Files:**
- Modify: `api/admin.js`
- Modify: `chat/index.html`
- Test: `tests/chat-admin-identity.test.mjs`
- Test: `tests/chat-ui.test.mjs`

- [ ] **Step 1: Run all targeted tests together**
- [ ] **Step 2: Sanity-check no existing test regressions**
