import test from "node:test";
import assert from "node:assert/strict";

import {
  SESSION_COOKIE_NAME,
  buildClearedSessionCookie,
  buildSessionCookie,
  createSessionValue,
  verifySessionValue,
} from "../lib/session.mjs";

const SECRET = "test-session-secret";

test("createSessionValue returns a verifiable session token", async () => {
  const value = await createSessionValue(SECRET);

  assert.notEqual(await verifySessionValue(value, SECRET), null);
});

test("verifySessionValue rejects tampered tokens", async () => {
  const value = await createSessionValue(SECRET);
  const [payload, signature] = value.split(".");
  const tampered = `${payload.slice(0, -1)}x.${signature}`;

  assert.equal(await verifySessionValue(tampered, SECRET), null);
});

test("buildSessionCookie creates a session-scoped HttpOnly cookie", () => {
  const cookie = buildSessionCookie("signed-value", { secure: true });

  assert.match(cookie, new RegExp(`^${SESSION_COOKIE_NAME}=signed-value;`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.doesNotMatch(cookie, /Max-Age=/);
});

test("buildClearedSessionCookie expires the session cookie immediately", () => {
  const cookie = buildClearedSessionCookie({ secure: false });

  assert.match(cookie, new RegExp(`^${SESSION_COOKIE_NAME}=;`));
  assert.match(cookie, /Max-Age=0/);
  assert.doesNotMatch(cookie, /Secure/);
});
