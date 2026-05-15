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
