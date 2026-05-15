import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function invokeHandlerWithMissingFirebaseConfig(moduleRelativePath, { method = "POST", url = "https://example.com/api/test", body = {} } = {}) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, moduleRelativePath)).href;
  const script = `
    process.env.FIREBASE_PROJECT_ID = "";
    process.env.FIREBASE_CLIENT_EMAIL = "";
    process.env.FIREBASE_PRIVATE_KEY = "";
    process.env.SESSION_SECRET = "";
    process.env.CHAT_FIREBASE_PROJECT_ID = "";
    process.env.CHAT_FIREBASE_CLIENT_EMAIL = "";
    process.env.CHAT_FIREBASE_PRIVATE_KEY = "";
    const { default: handler } = await import(${JSON.stringify(moduleUrl)});
    const result = { statusCode: 200, headers: {} };
    const req = {
      method: ${JSON.stringify(method)},
      url: ${JSON.stringify(url)},
      headers: { host: "example.com" },
      body: ${JSON.stringify(body)}
    };
    const res = {
      setHeader(name, value) {
        result.headers[name] = value;
      },
      status(code) {
        result.statusCode = code;
        return this;
      },
      json(payload) {
        result.body = payload;
        process.stdout.write(JSON.stringify(result));
        return this;
      }
    };
    await handler(req, res);
  `;

  const proc = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  return JSON.parse(proc.stdout);
}

test("unlock handler returns a configured 500 instead of crashing when Firebase env is missing", () => {
  const result = invokeHandlerWithMissingFirebaseConfig("api/unlock.js", {
    body: { key: "TEST", hwid: "device" },
  });

  assert.equal(result.statusCode, 500);
  assert.deepEqual(result.body, { error: "Unlock service is not configured" });
});

test("admin handler returns a configured 500 instead of crashing when Firebase env is missing", () => {
  const result = invokeHandlerWithMissingFirebaseConfig("api/admin.js", {
    method: "GET",
    url: "https://example.com/api/admin?action=config",
  });

  assert.equal(result.statusCode, 500);
  assert.deepEqual(result.body, { error: "Service not configured" });
});

test("chat profile handler returns a configured 500 instead of crashing when Firebase env is missing", () => {
  const result = invokeHandlerWithMissingFirebaseConfig("api/chat-profile.js", {
    method: "POST",
    url: "https://example.com/api/chat-profile?action=rename",
    body: { name: "Test" },
  });

  assert.equal(result.statusCode, 500);
  assert.deepEqual(result.body, { error: "Service not configured" });
});
