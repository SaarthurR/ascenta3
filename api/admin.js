import { SESSION_COOKIE_NAME, verifySessionValue } from "../lib/session.mjs";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const SESSION_SECRET = process.env.SESSION_SECRET;

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
      const configDoc = await getDocument("config", "global");
      return res.status(200).json({
        siteDisabled: configDoc?.siteDisabled ?? false,
        gamesDisabled: configDoc?.gamesDisabled ?? false,
        maintenanceMessage: configDoc?.maintenanceMessage ?? "Ascenta3 is temporarily offline. Check back soon.",
      });
    } catch (err) {
      console.error("admin/config GET failed", err);
      return res.status(500).json({ error: "Failed to read config" });
    }
  }

  // All routes below require admin session
  const adminPayload = await requireAdmin(req, res);
  if (!adminPayload) return;

  try {
    // GET /api/admin/status
    if (action === "status" && method === "GET") {
      const configDoc = await getDocument("config", "global");
      return res.status(200).json({
        siteDisabled: configDoc?.siteDisabled ?? false,
        gamesDisabled: configDoc?.gamesDisabled ?? false,
        maintenanceMessage: configDoc?.maintenanceMessage ?? "",
        sessionRevokedAt: configDoc?.sessionRevokedAt ?? 0,
      });
    }

    // POST /api/admin/config — update site/games flags
    if (action === "config" && method === "POST") {
      const body = await readJsonBody(req);
      const allowed = ["siteDisabled", "gamesDisabled", "maintenanceMessage"];
      const updates = {};
      for (const key of allowed) {
        if (key in body) updates[key] = body[key];
      }
      await db.collection("config").doc("global").set(updates, { merge: true });
      return res.status(200).json({ ok: true });
    }

    // GET /api/admin/users — online AscentChat users (lastSeen within 10 min)
    if (action === "users" && method === "GET") {
      const cutoff = Date.now() - 10 * 60 * 1000;
      const snapshot = await db.collection("users")
        .where("lastSeen", ">", cutoff)
        .orderBy("lastSeen", "desc")
        .get();
      const users = snapshot.docs.map(doc => ({
        uid: doc.id,
        username: doc.data().username ?? doc.id,
        lastSeen: doc.data().lastSeen,
        banned: doc.data().banned ?? false,
      }));
      return res.status(200).json({ users });
    }

    // POST /api/admin/kick-user — ban user from chat
    if (action === "kick-user" && method === "POST") {
      const { uid } = await readJsonBody(req);
      if (!uid) return res.status(400).json({ error: "Missing uid" });
      await db.collection("users").doc(uid).set({ banned: true, lastSeen: 0 }, { merge: true });
      return res.status(200).json({ ok: true });
    }

    // POST /api/admin/revoke-key — delete an access key
    if (action === "revoke-key" && method === "POST") {
      const { key } = await readJsonBody(req);
      if (!key) return res.status(400).json({ error: "Missing key" });
      await db.collection("keys").doc(key).delete();
      await db.collection("used_keys").doc(key).delete();
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

    // POST /api/admin/add-key — add a new access key
    if (action === "add-key" && method === "POST") {
      const { key } = await readJsonBody(req);
      if (!key || typeof key !== "string" || key.trim() === "") {
        return res.status(400).json({ error: "Invalid key" });
      }
      await db.collection("keys").doc(key.trim()).set({ createdAt: Date.now() });
      return res.status(200).json({ ok: true });
    }

    // POST /api/admin/admin-keys — add or remove admin keys
    if (action === "admin-keys" && method === "POST") {
      const { action: op, key } = await readJsonBody(req);
      if (!key || !["add", "remove"].includes(op)) {
        return res.status(400).json({ error: "Invalid request" });
      }
      if (op === "add") {
        await db.collection("admin_keys").doc(key.trim()).set({ createdAt: Date.now() });
      } else {
        await db.collection("admin_keys").doc(key.trim()).delete();
      }
      return res.status(200).json({ ok: true });
    }

    // POST /api/admin/broadcast — send announcement to chat
    if (action === "broadcast" && method === "POST") {
      const { message } = await readJsonBody(req);
      if (!message || typeof message !== "string" || message.trim() === "") {
        return res.status(400).json({ error: "Missing message" });
      }
      await db.collection("announcements").doc("global").set({
        message: message.trim(),
        sentAt: Date.now(),
        sentBy: "admin",
      });
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
