import { SESSION_COOKIE_NAME, verifySessionValue } from "../lib/session.mjs";
import { normalizeAccessKey } from "../lib/access-keys.mjs";
import {
  buildChatBanKey,
  removeUserFromGroups,
  renameUserHistory,
  validateChatName,
} from "../lib/chat-admin-identity.mjs";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const SESSION_SECRET = process.env.SESSION_SECRET;

// Main app (keys, config, hub_sessions)
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = getFirestore();

// Chat app — asenchata project (may be same as main or separate)
// Set CHAT_FIREBASE_PROJECT_ID / CHAT_FIREBASE_CLIENT_EMAIL / CHAT_FIREBASE_PRIVATE_KEY
// in Vercel if your main FIREBASE_PROJECT_ID is NOT "asenchata".
// If not set, falls back to main db (assumes same project).
function getChatDb() {
  const proj = process.env.CHAT_FIREBASE_PROJECT_ID;
  if (!proj) return db;
  const appName = "asenchata-chat";
  const existing = getApps().find(a => a.name === appName);
  if (existing) return getFirestore(existing);
  const app = initializeApp({
    credential: cert({
      projectId: proj,
      clientEmail: process.env.CHAT_FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.CHAT_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  }, appName);
  return getFirestore(app);
}

function getChatAuth() {
  const proj = process.env.CHAT_FIREBASE_PROJECT_ID;
  if (!proj) return getAuth();
  const appName = "asenchata-chat";
  const existing = getApps().find(a => a.name === appName);
  if (existing) return getAuth(existing);
  const app = initializeApp({
    credential: cert({
      projectId: proj,
      clientEmail: process.env.CHAT_FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.CHAT_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  }, appName);
  return getAuth(app);
}

function readCookie(cookieHeader, name) {
  const prefix = `${name}=`;
  for (const part of (cookieHeader || "").split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length);
  }
  return "";
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.length > 0) return JSON.parse(req.body);
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function getDocument(collection, id) {
  const doc = await db.collection(collection).doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function ensureUniqueChatName(chatDb, uid, name) {
  const snap = await chatDb.collection("users").where("name", "==", name).get();
  return !snap.docs.some(doc => doc.id !== uid);
}

async function requireAdmin(req, res) {
  const cookieHeader = req.headers["cookie"] || "";
  const sessionValue = readCookie(cookieHeader, SESSION_COOKIE_NAME);
  const payload = await verifySessionValue(sessionValue, SESSION_SECRET);
  if (!payload?.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return payload;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return res.status(500).json({ error: "Service not configured" });
  }

  if (!SESSION_SECRET) {
    return res.status(500).json({ error: "Session secret not configured" });
  }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const action = url.searchParams.get("action") || url.pathname.split("/").pop();
  const method = req.method;

  // Public endpoint — no auth required
  if (action === "config" && method === "GET") {
    try {
      const [configDoc, chatConfigSnap] = await Promise.all([
        getDocument("config", "global"),
        getChatDb().collection("config").doc("global").get(),
      ]);
      const chatConfig = chatConfigSnap.exists ? chatConfigSnap.data() : {};
      return res.status(200).json({
        siteDisabled: configDoc?.siteDisabled ?? false,
        gamesDisabled: configDoc?.gamesDisabled ?? false,
        maintenanceMessage: configDoc?.maintenanceMessage ?? "Ascenta3 is temporarily offline. Check back soon.",
        broadcastMessage: configDoc?.broadcastMessage ?? null,
        broadcastSentAt: configDoc?.broadcastSentAt ?? 0,
        sessionRevokedAt: configDoc?.sessionRevokedAt ?? 0,
        accountsLocked: chatConfig.accountsLocked ?? false,
        namesLocked: chatConfig.namesLocked ?? false,
      });
    } catch (err) {
      console.error("admin/config GET failed", err);
      return res.status(500).json({ error: "Failed to read config" });
    }
  }

  // Low-auth: valid session but not admin required
  if (action === "heartbeat" && method === "POST") {
    try {
      const cookieHeader = req.headers["cookie"] || "";
      const sessionValue = readCookie(cookieHeader, SESSION_COOKIE_NAME);
      const payload = await verifySessionValue(sessionValue, SESSION_SECRET);
      if (!payload) return res.status(401).json({ error: "No session" });
      const { sid, hint, fullKey, game } = await readJsonBody(req);
      if (!sid || typeof sid !== "string" || sid.length > 32 || !/^[a-z0-9]+$/.test(sid)) {
        return res.status(400).json({ error: "Invalid sid" });
      }
      const safeHint = typeof hint === "string" ? hint.slice(0, 12) : "";
      const update = { lastSeen: Timestamp.now() };
      if (safeHint) update.hint = safeHint;
      if (typeof fullKey === "string" && fullKey.length <= 64) update.fullKey = fullKey;
      if (typeof game === "string") update.game = game.slice(0, 80);
      else update.game = null;
      await db.collection("hub_sessions").doc(sid).set(update, { merge: true });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "Heartbeat failed" });
    }
  }

  // No auth: check if a hub session has been kicked (sid is unguessable random string)
  if (action === "check-kick" && method === "GET") {
    try {
      const sid = url.searchParams.get("sid");
      if (!sid || !/^[a-z0-9]{6,32}$/.test(sid)) return res.status(400).json({ error: "Invalid" });
      const doc = await db.collection("hub_sessions").doc(sid).get();
      return res.status(200).json({ kicked: doc.exists && !!doc.data().kicked });
    } catch {
      return res.status(200).json({ kicked: false });
    }
  }

  // All routes below require admin session
  const adminPayload = await requireAdmin(req, res);
  if (!adminPayload) return;

  try {
    // GET /api/admin/status
    if (action === "status" && method === "GET") {
      const chatDb = getChatDb();
      const [configDoc, chatConfigSnap] = await Promise.all([
        getDocument("config", "global"),
        chatDb.collection("config").doc("global").get(),
      ]);
      const chatData = chatConfigSnap.exists ? chatConfigSnap.data() : {};
      return res.status(200).json({
        siteDisabled: configDoc?.siteDisabled ?? false,
        gamesDisabled: configDoc?.gamesDisabled ?? false,
        maintenanceMessage: configDoc?.maintenanceMessage ?? "",
        sessionRevokedAt: configDoc?.sessionRevokedAt ?? 0,
        chatMuted: chatData.chatMuted ?? false,
        accountsLocked: chatData.accountsLocked ?? false,
        namesLocked: chatData.namesLocked ?? false,
      });
    }

    // POST /api/admin/config — update site/games flags and chat mute
    if (action === "config" && method === "POST") {
      const body = await readJsonBody(req);
      const allowed = ["siteDisabled", "gamesDisabled", "maintenanceMessage"];
      const updates = {};
      for (const key of allowed) {
        if (key in body) updates[key] = body[key];
      }
      const promises = [];
      if (Object.keys(updates).length) {
        promises.push(db.collection("config").doc("global").set(updates, { merge: true }));
      }
      if ("chatMuted" in body) {
        promises.push(getChatDb().collection("config").doc("global").set({ chatMuted: !!body.chatMuted }, { merge: true }));
      }
      if ("accountsLocked" in body) {
        promises.push(getChatDb().collection("config").doc("global").set({ accountsLocked: !!body.accountsLocked }, { merge: true }));
      }
      if ("namesLocked" in body) {
        promises.push(getChatDb().collection("config").doc("global").set({ namesLocked: !!body.namesLocked }, { merge: true }));
      }
      await Promise.all(promises);
      return res.status(200).json({ ok: true });
    }

    // GET /api/admin/users — online users (chat + hub) within last 90s
    if (action === "users" && method === "GET") {
      const cutoffMs = Date.now() - 90 * 1000;
      const tsMs = ts => {
        if (!ts) return 0;
        if (typeof ts.toMillis === "function") return ts.toMillis();
        if (typeof ts.toDate === "function") return ts.toDate().getTime();
        if (typeof ts === "number") return ts;
        return 0;
      };
      const chatDb = getChatDb();
      const [chatSnap, hubSnap] = await Promise.all([
        chatDb.collection("users").get(),
        db.collection("hub_sessions").where("lastSeen", ">", Timestamp.fromMillis(cutoffMs)).get(),
      ]);
      const chatUsers = chatSnap.docs
        .map(doc => {
          const d = doc.data();
          return { uid: doc.id, username: d.name ?? d.username ?? doc.id, lastSeen: tsMs(d.lastSeen), banned: d.banned ?? false, isChatAdmin: d.isChatAdmin ?? false, source: "chat" };
        })
        .filter(u => u.lastSeen > cutoffMs);
      const hubUsers = hubSnap.docs.map(doc => {
        const d = doc.data();
        const hint = d.hint ? `Player (${d.hint})` : "Hub User";
        return { uid: doc.id, username: hint, fullKey: d.fullKey || null, game: d.game || null, lastSeen: tsMs(d.lastSeen), banned: false, source: "hub" };
      });
      const users = [...chatUsers, ...hubUsers].sort((a, b) => b.lastSeen - a.lastSeen);
      return res.status(200).json({ users });
    }

    // POST /api/admin/kick-user — kick chat or hub user
    if (action === "kick-user" && method === "POST") {
      const { uid, source } = await readJsonBody(req);
      if (!uid) return res.status(400).json({ error: "Missing uid" });
      if (source === "hub") {
        await db.collection("hub_sessions").doc(uid).set({ kicked: true, lastSeen: Timestamp.fromMillis(0) }, { merge: true });
      } else {
        const chatDb = getChatDb();
        await chatDb.collection("users").doc(uid).set({ kickedAt: Timestamp.now(), lastSeen: Timestamp.fromMillis(0) }, { merge: true });
      }
      return res.status(200).json({ ok: true });
    }

    // POST /api/admin/revoke-key — delete an access key
    if (action === "revoke-key" && method === "POST") {
      const { key } = await readJsonBody(req);
      const normalizedKey = normalizeAccessKey(key);
      if (!normalizedKey) return res.status(400).json({ error: "Missing key" });
      await db.collection("keys").doc(normalizedKey).delete();
      await db.collection("used_keys").doc(normalizedKey).delete();
      return res.status(200).json({ ok: true });
    }

    // GET /api/admin/keys — list active and used keys
    if (action === "keys" && method === "GET") {
      const [activeSnap, usedSnap] = await Promise.all([
        db.collection("keys").get(),
        db.collection("used_keys").get(),
      ]);
      return res.status(200).json({
        active: activeSnap.docs.map(d => ({ key: d.id, ...d.data() })),
        used: usedSnap.docs.map(d => ({ key: d.id, ...d.data() })),
      });
    }

    // GET /api/admin/admin-keys — list admin keys
    if (action === "admin-keys" && method === "GET") {
      const adminSnap = await db.collection("dev_keys").get();
      return res.status(200).json({
        keys: adminSnap.docs.map(d => d.id),
      });
    }

    // POST /api/admin/add-key — add a new access key
    if (action === "add-key" && method === "POST") {
      const { key } = await readJsonBody(req);
      const normalizedKey = normalizeAccessKey(key);
      if (!normalizedKey) {
        return res.status(400).json({ error: "Invalid key" });
      }
      await db.collection("keys").doc(normalizedKey).set({ createdAt: Date.now() });
      return res.status(200).json({ ok: true });
    }

    // POST /api/admin/admin-keys — add or remove admin keys
    if (action === "admin-keys" && method === "POST") {
      const { action: op, key } = await readJsonBody(req);
      const normalizedKey = normalizeAccessKey(key);
      if (!normalizedKey || !["add", "remove"].includes(op)) {
        return res.status(400).json({ error: "Invalid request" });
      }
      if (op === "add") {
        await db.collection("dev_keys").doc(normalizedKey).set({ createdAt: Date.now() });
      } else {
        await db.collection("dev_keys").doc(normalizedKey).delete();
      }
      return res.status(200).json({ ok: true });
    }

    // POST /api/admin/broadcast — send announcement to chat and hub
    if (action === "broadcast" && method === "POST") {
      const { message } = await readJsonBody(req);
      if (!message || typeof message !== "string" || message.trim() === "") {
        return res.status(400).json({ error: "Missing message" });
      }
      const sentAt = Date.now();
      await Promise.all([
        // chat picks this up via onSnapshot — must write to chat's firebase project
        getChatDb().collection("announcements").doc("global").set({
          message: message.trim(),
          sentAt,
          sentBy: "admin",
        }),
        // hub polls config and picks this up
        db.collection("config").doc("global").set({
          broadcastMessage: message.trim(),
          broadcastSentAt: sentAt,
        }, { merge: true }),
      ]);
      return res.status(200).json({ ok: true });
    }

    // POST /api/admin/clear-chat-users — delete all chat user docs
    if (action === "clear-chat-users" && method === "POST") {
      const chatDb = getChatDb();
      const snap = await chatDb.collection("users").get();
      const batch = chatDb.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      return res.status(200).json({ ok: true, deleted: snap.size });
    }

    // POST /api/admin/rename-chat-user — rename a chat user
    if (action === "rename-chat-user" && method === "POST") {
      const { uid, name } = await readJsonBody(req);
      if (!uid || !name) return res.status(400).json({ error: "Missing uid or name" });
      const validation = validateChatName(name);
      if (!validation.ok) return res.status(400).json({ error: validation.error });
      const chatDb = getChatDb();
      const userRef = chatDb.collection("users").doc(uid);
      const userSnap = await userRef.get();
      if (!userSnap.exists) return res.status(404).json({ error: "Chat user not found" });
      if (!(await ensureUniqueChatName(chatDb, uid, validation.name))) {
        return res.status(409).json({ error: "Name taken, try another." });
      }
      const userData = userSnap.data();
      const previousName = userData.name ?? userData.username ?? "";
      await renameUserHistory(chatDb, {
        uid,
        previousName,
        nextName: validation.name,
      });
      await userRef.set({ name: validation.name, uid }, { merge: true });
      return res.status(200).json({ ok: true });
    }

    // POST /api/admin/remove-chat-user — delete a single chat user doc
    if (action === "remove-chat-user" && method === "POST") {
      const { uid } = await readJsonBody(req);
      if (!uid) return res.status(400).json({ error: "Missing uid" });
      const chatDb = getChatDb();
      const userRef = chatDb.collection("users").doc(uid);
      const userSnap = await userRef.get();
      if (!userSnap.exists) return res.status(404).json({ error: "Chat user not found" });
      const userData = userSnap.data();
      const username = userData.name ?? userData.username ?? "";
      const bannedAt = Timestamp.now();
      const banKey = buildChatBanKey(username);
      await chatDb.collection("moderation_events").doc(uid).set({
        action: "removed",
        title: "Your account was deleted",
        message: "An admin permanently deleted and banned your AscentChat account.",
        bannedAt,
        uid,
        name: username,
      }, { merge: true });
      if (banKey) {
        await chatDb.collection("banned_names").doc(buildChatBanKey(username)).set({
          uid,
          name: username,
          bannedAt,
        }, { merge: true });
      }
      await removeUserFromGroups(chatDb, uid);
      await userRef.delete();
      try {
        await getChatAuth().deleteUser(uid);
      } catch (err) {
        if (err?.code !== "auth/user-not-found") throw err;
      }
      return res.status(200).json({ ok: true });
    }

    // GET /api/admin/chat-users — all chat users (for admin grant UI)
    if (action === "chat-users" && method === "GET") {
      const chatDb = getChatDb();
      const snap = await chatDb.collection("users").get();
      const users = snap.docs.map(doc => {
        const d = doc.data();
        return { uid: doc.id, username: d.name ?? d.username ?? doc.id, isChatAdmin: d.isChatAdmin ?? false };
      });
      users.sort((a, b) => (a.username || "").localeCompare(b.username || ""));
      return res.status(200).json({ users });
    }

    // POST /api/admin/set-chat-admin — grant or revoke chat admin on a user doc
    if (action === "set-chat-admin" && method === "POST") {
      const { uid, isChatAdmin } = await readJsonBody(req);
      if (!uid) return res.status(400).json({ error: "Missing uid" });
      await getChatDb().collection("users").doc(uid).update({ isChatAdmin: !!isChatAdmin });
      return res.status(200).json({ ok: true });
    }

    // POST /api/admin/add-to-community — force-add a chat user to the community group
    if (action === "add-to-community" && method === "POST") {
      const { uid } = await readJsonBody(req);
      if (!uid) return res.status(400).json({ error: "Missing uid" });
      const chatDb = getChatDb();
      await chatDb.collection("groups").doc("community").set(
        { members: FieldValue.arrayUnion(uid) },
        { merge: true }
      );
      return res.status(200).json({ ok: true });
    }

    // POST /api/admin/clear-sessions — revoke all existing sessions
    if (action === "clear-sessions" && method === "POST") {
      await db.collection("config").doc("global").set(
        { sessionRevokedAt: Date.now() },
        { merge: true }
      );
      return res.status(200).json({ ok: true });
    }

    return res.status(404).json({ error: "Unknown admin action" });
  } catch (err) {
    console.error("Admin API error", err);
    return res.status(500).json({ error: "Admin action failed" });
  }
}
