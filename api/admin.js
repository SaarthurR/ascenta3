import { SESSION_COOKIE_NAME, verifySessionValue } from "../lib/session.mjs";
import { normalizeAccessKey } from "../lib/access-keys.mjs";
import {
  buildChatBanKey,
  removeUserFromGroups,
  renameUserHistory,
  validateChatName,
} from "../lib/chat-admin-identity.mjs";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getChatAuth, getChatDb, getMainDb, hasMainFirebaseConfig } from "../lib/firebase-admin-apps.mjs";

const SESSION_SECRET = process.env.SESSION_SECRET;

const db = new Proxy({}, {
  get(_target, prop) {
    const firestore = getMainDb();
    const value = firestore[prop];
    return typeof value === "function" ? value.bind(firestore) : value;
  },
});

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

async function permanentlyDeleteChatUser(chatDb, uid, userData) {
  const userRef = chatDb.collection("users").doc(uid);
  const username = userData?.name ?? userData?.username ?? "";
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

  const hwid = userData?.hwid;
  if (hwid) {
    await chatDb.collection("banned_hwids").doc(hwid).set({
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
    console.error("deleteUser failed (non-fatal):", err?.code || err?.message);
  }
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

  if (!hasMainFirebaseConfig()) {
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
      const [configDoc, chatData] = await Promise.all([
        getDocument("config", "global"),
        (async () => {
          try {
            const chatDb = getChatDb();
            const snap = await chatDb.collection("config").doc("global").get();
            return snap.exists ? snap.data() : {};
          } catch (err) {
            console.error("admin/status: chat config fetch failed", err.message);
            return {};
          }
        })(),
      ]);
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
      const [chatUsers, hubUsers] = await Promise.all([
        (async () => {
          try {
            const chatDb = getChatDb();
            const snap = await chatDb.collection("users").get();
            return snap.docs
              .map(doc => {
                const d = doc.data();
                return { uid: doc.id, username: d.name ?? d.username ?? doc.id, lastSeen: tsMs(d.lastSeen), banned: d.banned ?? false, isChatAdmin: d.isChatAdmin ?? false, source: "chat" };
              })
              .filter(u => u.lastSeen > cutoffMs);
          } catch (err) {
            console.error("admin/users: chat fetch failed:", err.message);
            return [];
          }
        })(),
        (async () => {
          try {
            const snap = await db.collection("hub_sessions").where("lastSeen", ">", Timestamp.fromMillis(cutoffMs)).get();
            return snap.docs.map(doc => {
              const d = doc.data();
              const hint = d.hint ? `Player (${d.hint})` : "Hub User";
              return { uid: doc.id, username: hint, fullKey: d.fullKey || null, game: d.game || null, lastSeen: tsMs(d.lastSeen), banned: false, source: "hub" };
            });
          } catch (err) {
            console.error("admin/users: hub fetch failed:", err.message);
            return [];
          }
        })(),
      ]);
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
      await Promise.all(snap.docs.map(doc => permanentlyDeleteChatUser(chatDb, doc.id, doc.data())));
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
      try {
        await renameUserHistory(chatDb, {
          uid,
          previousName,
          nextName: validation.name,
        });
      } catch (err) {
        console.error("renameUserHistory failed (non-fatal):", err?.message);
      }
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
      await permanentlyDeleteChatUser(chatDb, uid, userSnap.data());
      return res.status(200).json({ ok: true });
    }

    // GET /api/admin/chat-users — all chat users (for admin grant UI)
    if (action === "chat-users" && method === "GET") {
      try {
        const chatDb = getChatDb();
        const [usersSnap, hwidBansSnap, nameBansSnap] = await Promise.all([
          chatDb.collection("users").get(),
          chatDb.collection("banned_hwids").get(),
          chatDb.collection("banned_names").get(),
        ]);
        const hwidBannedUids = new Set(hwidBansSnap.docs.map(d => d.data().uid).filter(Boolean));
        const bannedNameKeys = new Set(nameBansSnap.docs.map(d => d.id));
        const users = usersSnap.docs.map(doc => {
          const d = doc.data();
          const username = d.name ?? d.username ?? doc.id;
          const nameKey = buildChatBanKey(username);
          return {
            uid: doc.id,
            username,
            isChatAdmin: d.isChatAdmin ?? false,
            hwidBanned: hwidBannedUids.has(doc.id),
            nameBanned: nameKey ? bannedNameKeys.has(nameKey) : false,
          };
        });
        users.sort((a, b) => (a.username || "").localeCompare(b.username || ""));
        return res.status(200).json({ users });
      } catch (err) {
        console.error("admin/chat-users failed:", err.message);
        return res.status(500).json({ error: `Chat DB error: ${err.message}` });
      }
    }

    // POST /api/admin/hwid-ban — ban device, kick user, and notify them immediately
    if (action === "hwid-ban" && method === "POST") {
      const { uid } = await readJsonBody(req);
      if (!uid) return res.status(400).json({ error: "Missing uid" });
      const chatDb = getChatDb();
      const userSnap = await chatDb.collection("users").doc(uid).get();
      if (!userSnap.exists) return res.status(404).json({ error: "Chat user not found" });
      const userData = userSnap.data();
      const hwid = userData?.hwid;
      if (!hwid) return res.status(400).json({ error: "No device fingerprint on file for this user" });
      const username = userData?.name ?? userData?.username ?? "";
      const bannedAt = Timestamp.now();
      await Promise.all([
        chatDb.collection("banned_hwids").doc(hwid).set({ uid, name: username, bannedAt }, { merge: true }),
        chatDb.collection("moderation_events").doc(uid).set({
          action: "banned",
          title: "You've been banned",
          message: "You have been permanently banned from AscentChat.",
          bannedAt,
          uid,
          name: username,
        }, { merge: true }),
      ]);
      return res.status(200).json({ ok: true });
    }

    // POST /api/admin/delete-account — delete chat account without banning (user can rejoin)
    if (action === "delete-account" && method === "POST") {
      const { uid } = await readJsonBody(req);
      if (!uid) return res.status(400).json({ error: "Missing uid" });
      const chatDb = getChatDb();
      const userRef = chatDb.collection("users").doc(uid);
      const userSnap = await userRef.get();
      if (!userSnap.exists) return res.status(404).json({ error: "Chat user not found" });
      const username = userSnap.data()?.name ?? userSnap.data()?.username ?? "";
      await chatDb.collection("moderation_events").doc(uid).set({
        action: "removed",
        title: "Account deleted",
        message: "An admin deleted your AscentChat account. You may create a new one.",
        bannedAt: Timestamp.now(),
        uid,
        name: username,
      }, { merge: true });
      await removeUserFromGroups(chatDb, uid);
      await userRef.delete();
      try { await getChatAuth().deleteUser(uid); } catch (err) {
        console.error("deleteUser failed (non-fatal):", err?.code || err?.message);
      }
      return res.status(200).json({ ok: true });
    }

    // GET /api/admin/bans — list all HWID-banned users
    if (action === "bans" && method === "GET") {
      const chatDb = getChatDb();
      const snap = await chatDb.collection("banned_hwids").orderBy("bannedAt", "desc").get();
      const bans = snap.docs.map(d => ({
        hwid: d.id,
        ...d.data(),
        bannedAt: d.data().bannedAt?.toMillis?.() ?? 0,
      }));
      return res.status(200).json({ bans });
    }

    // POST /api/admin/unban-hwid — remove a device ban
    if (action === "unban-hwid" && method === "POST") {
      const { hwid } = await readJsonBody(req);
      if (!hwid) return res.status(400).json({ error: "Missing hwid" });
      await getChatDb().collection("banned_hwids").doc(hwid).delete();
      return res.status(200).json({ ok: true });
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

    // POST /api/admin/clear-community-messages — delete all messages in the community group
    if (action === "clear-community-messages" && method === "POST") {
      const chatDb = getChatDb();
      const msgsRef = chatDb.collection("groups").doc("community").collection("messages");
      let deleted = 0;
      let snap = await msgsRef.limit(400).get();
      while (!snap.empty) {
        const batch = chatDb.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        deleted += snap.docs.length;
        snap = await msgsRef.limit(400).get();
      }
      return res.status(200).json({ ok: true, deleted });
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
    return res.status(500).json({ error: err.message || "Admin action failed" });
  }
}
