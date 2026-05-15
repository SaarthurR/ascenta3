import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const adminHtml = await readFile(new URL("../admin.html", import.meta.url), "utf8");
const adminApi = await readFile(new URL("../api/admin.js", import.meta.url), "utf8");

test("chat-admins panel owns rename actions for offline-capable user management", () => {
  assert.doesNotMatch(adminHtml, /data-action="rename-chat"/);
  assert.match(adminHtml, /ca-rename/);
  assert.match(adminHtml, /New name for/);
});

test("remove-chat-user permanently bans the chat identity and deletes auth", () => {
  assert.match(adminApi, /collection\("moderation_events"\)\.doc\(uid\)\.set/);
  assert.match(adminApi, /collection\("banned_names"\)\.doc\(buildChatBanKey\(/);
  assert.match(adminApi, /await getChatAuth\(\)\.deleteUser\(uid\)/);
});

test("clear-chat-users uses the same permanent delete-ban flow for every account", () => {
  assert.match(adminApi, /action === "clear-chat-users" && method === "POST"/);
  assert.match(adminApi, /Promise\.all\(snap\.docs\.map\(doc => permanentlyDeleteChatUser\(chatDb, doc\.id, doc\.data\(\)\)\)\)/);
  assert.match(adminHtml, /Permanently delete and ban ALL AscentChat users/);
});

test("active key removal reloads from the backend without the tabbed admin tools wrapper", () => {
  assert.match(adminHtml, /if \(ok\) await loadKeys\(\);/);
  assert.doesNotMatch(adminHtml, /id="admin-tools-tabs"/);
  assert.doesNotMatch(adminHtml, /function setAdminToolsTab\(tab\)/);
  assert.match(adminHtml, /\/\/ KEY MANAGEMENT/);
  assert.match(adminHtml, /\/\/ DEV CODES/);
});
