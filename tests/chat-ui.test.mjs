import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const chatHtml = await readFile(new URL("../chat/index.html", import.meta.url), "utf8");

test("chat rename affordance reflects the name-freeze state", () => {
  assert.match(chatHtml, /id="renameChip"/);
  assert.match(chatHtml, /function syncRenameUi\(\)\s*\{/);
  assert.match(chatHtml, /_namesLocked\?['"]Display names are frozen by admin['"]:/);
});

test("chat rename handlers block user-triggered renames when names are locked", () => {
  assert.match(chatHtml, /function openRename\(\)\{\s*if\(_namesLocked\)/);
  assert.match(chatHtml, /async function confirmRename\(\)\{\s*if\(_namesLocked\)/);
  assert.match(chatHtml, /fetch\('\/api\/chat-profile\?action=rename'/);
});

test("chat repairs orphaned group members instead of rendering raw uid fragments", () => {
  assert.match(chatHtml, /function getKnownUserIds\(\)\s*\{/);
  assert.match(chatHtml, /function getVisibleGroupMembers\(members\)\s*\{/);
  assert.match(chatHtml, /async function repairGroupMembers\(group\)\s*\{/);
  assert.match(chatHtml, /FieldValue\.arrayRemove\(\.\.\.unknown\)/);
  assert.match(chatHtml, /_activeGroupMembers=getVisibleGroupMembers\(members\|\|\[\]\)/);
});

test("chat listens for moderation events and blocks banned names from rejoining", () => {
  assert.match(chatHtml, /function listenModeration\(\)\s*\{/);
  assert.match(chatHtml, /db\.collection\('moderation_events'\)\.doc\(myUid\)\.onSnapshot/);
  assert.match(chatHtml, /function showRemoved\(/);
  assert.match(chatHtml, /db\.collection\('banned_names'\)\.doc\(banKeyForName\(name\)\)\.get\(\)/);
});

test("chat message bubbles no longer render per-message timestamps", () => {
  assert.doesNotMatch(chatHtml, /<div class="m-time">\$\{fmtT\(m\.timestamp\)\}<\/div>/);
});
