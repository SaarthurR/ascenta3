# Ascenta 3

A session-gated arcade portal — a curated collection of browser games behind an access-key login, with a signed-session auth layer, an admin panel, and a built-in chat. Deployed on Vercel.

**Live:** [ascenta3.vercel.app](https://ascenta3.vercel.app)

## What it is

Ascenta 3 is a games hub you unlock with an access key. Redeem a key once and a signed session cookie keeps you in; every game route and the admin panel are protected at the edge, so nothing under `/games` is reachable without a valid session.

The interesting part isn't the games — it's the access-control and session machinery built around them on a serverless stack.

## How it works

- **Edge middleware** (`middleware.js`) runs on every request to `/games/*` and `/admin.html`. It reads the session cookie, verifies it, and either lets the request through, redirects to the landing page, or returns `403`. Admin routes additionally require an `isAdmin` claim.
- **Signed sessions** (`lib/session.mjs`) — sessions are HMAC-signed payloads, verified stateless at the edge. No server round-trip to validate a cookie.
- **Access keys** (`lib/access-keys.mjs`, `api/unlock.js`) — keys are normalized and checked against a Firebase-backed store; a valid redemption mints a session and sets a `Secure`/`HttpOnly` cookie.
- **Admin API** (`api/admin.js`) — key management and content administration, gated behind the admin session claim.
- **Chat** (`chat/`, `api/chat-profile.js`) — a lightweight in-site chat with its own admin-identity handling.
- **Content pipeline** — `lib/manual-games.mjs`, `lib/generated-games.mjs`, and `lib/ugs-import.mjs` assemble the game catalog; `addgame.sh` adds a title into the content directory.

## Stack

- **Vercel** — static hosting + serverless functions + edge middleware (`@vercel/functions`)
- **Firebase Admin** (`firebase-admin`) — access-key and session-state backing store
- **Vanilla JS front end** — no framework on the main portal; a separate Svelte sub-app lives in `ascentacompass/`
- **Node test runner** — 10 test suites under `tests/` covering session signing, access-key normalization, admin identity, and UI logic

## Layout

```
middleware.js        Edge auth — protects /games and /admin
api/                 unlock · admin · chat-profile serverless fns
lib/                 session signing, access keys, catalog builders
tests/               node:test suites (*.test.mjs)
ascentacompass/      Svelte sub-app
chat/                In-site chat UI
```

## Local development

```bash
npm install
vercel dev          # serves functions + middleware locally
```

Requires a `SESSION_SECRET` (session signing) and Firebase Admin credentials in the environment for full functionality.
