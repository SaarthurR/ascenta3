import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { normalizeAccessKey } from "../lib/access-keys.mjs";

test("normalizeAccessKey trims string values and preserves numeric codes", () => {
  assert.equal(normalizeAccessKey(" 12345 "), "12345");
  assert.equal(normalizeAccessKey(12345), "12345");
  assert.equal(normalizeAccessKey(12345n), "12345");
});

test("normalizeAccessKey rejects empty and unsupported values", () => {
  assert.equal(normalizeAccessKey("   "), "");
  assert.equal(normalizeAccessKey(null), "");
  assert.equal(normalizeAccessKey(undefined), "");
  assert.equal(normalizeAccessKey({ key: "12345" }), "");
});

test("admin api supports listing admin keys for the panel", async () => {
  const adminApi = await readFile(new URL("../api/admin.js", import.meta.url), "utf8");
  assert.match(adminApi, /action === "admin-keys" && method === "GET"/);
  assert.match(adminApi, /keys:\s*adminSnap\.docs\.map\(d => d\.id\)/);
});

test("admin panel renders key values from api payload objects", async () => {
  const adminHtml = await readFile(new URL("../admin.html", import.meta.url), "utf8");
  assert.match(adminHtml, /function readKeyValue\(entry\)/);
  assert.match(adminHtml, /active\.forEach\(entry => \{/);
  assert.match(adminHtml, /used\.forEach\(entry => \{/);
  assert.match(adminHtml, /keys\.forEach\(entry => \{/);
});
