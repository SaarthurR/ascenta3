import test from "node:test";
import assert from "node:assert/strict";

import { getUnlockPreflightError } from "../lib/unlock-client.mjs";

test("getUnlockPreflightError explains that file URLs cannot reach the unlock API", () => {
  assert.equal(
    getUnlockPreflightError("file:"),
    "Run Ascenta through Vercel or `vercel dev` - `file://` cannot reach /api/unlock.",
  );
});

test("getUnlockPreflightError allows normal served protocols", () => {
  assert.equal(getUnlockPreflightError("http:"), "");
  assert.equal(getUnlockPreflightError("https:"), "");
});
