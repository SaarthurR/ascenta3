import { buildSessionCookie, createSessionValue } from "../lib/session.mjs";
import { normalizeAccessKey } from "../lib/access-keys.mjs";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const SESSION_SECRET = process.env.SESSION_SECRET;

// Initialize Firebase Admin SDK once (bypasses Firestore security rules)
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

function shouldUseSecureCookies(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const normalizedProto = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : String(forwardedProto || "").split(",")[0].trim();

  return normalizedProto === "https" || process.env.NODE_ENV === "production";
}

async function grantSession(res, req, extra = {}) {
  const sessionValue = await createSessionValue(SESSION_SECRET, extra);
  res.setHeader("Set-Cookie", buildSessionCookie(sessionValue, {
    secure: shouldUseSecureCookies(req),
  }));
}

async function getDocument(collection, id) {
  const doc = await db.collection(collection).doc(id).get();
  return doc.exists ? doc.data() : null;
}

async function setDocument(collection, id, fields) {
  await db.collection(collection).doc(id).set(fields);
}

async function deleteDocument(collection, id) {
  await db.collection(collection).doc(id).delete();
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

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return res.status(500).json({ error: "Unlock service is not configured" });
  }

  if (!SESSION_SECRET) {
    return res.status(500).json({ error: "Session secret is not configured" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { key, hwid } = await readJsonBody(req);
    const normalizedKey = normalizeAccessKey(key);
    const normalizedHwid = String(hwid ?? "").trim();

    if (!normalizedKey || !normalizedHwid) {
      return res.status(400).json({ error: "Missing key or device fingerprint" });
    }

    const devKeyDoc = await getDocument("dev_keys", normalizedKey);
    if (devKeyDoc) {
      await grantSession(res, req, { isAdmin: true });
      return res.status(200).json({ status: "admin" });
    }

    // admin_keys: reusable multi-device keys that grant regular hub access (no HWID lock)
    const adminKeyDoc = await getDocument("admin_keys", normalizedKey);
    if (adminKeyDoc) {
      await grantSession(res, req);
      return res.status(200).json({ status: "granted" });
    }

    const configDoc = await getDocument("config", "global");
    if (configDoc?.siteDisabled) {
      return res.status(200).json({ status: "disabled" });
    }

    const keyDoc = await getDocument("keys", normalizedKey);
    if (keyDoc) {
      await setDocument("used_keys", normalizedKey, {
        hwid: normalizedHwid,
        time: Date.now(),
      });
      await deleteDocument("keys", normalizedKey);
      await grantSession(res, req);
      return res.status(200).json({ status: "granted" });
    }

    const usedDoc = await getDocument("used_keys", normalizedKey);
    if (usedDoc) {
      const usedHwid = usedDoc.hwid ?? "";
      if (usedHwid === normalizedHwid) {
        await grantSession(res, req);
        return res.status(200).json({ status: "granted" });
      }
      return res.status(200).json({ status: "locked" });
    }

    return res.status(200).json({ status: "invalid" });
  } catch (error) {
    console.error("Unlock failed", error);
    return res.status(500).json({ error: "Unlock service failed" });
  }
}
