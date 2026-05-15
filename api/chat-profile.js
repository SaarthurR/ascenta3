import {
  renameUserHistory,
  validateChatName,
} from "../lib/chat-admin-identity.mjs";
import { getChatAuth, getChatDb, hasMainFirebaseConfig } from "../lib/firebase-admin-apps.mjs";

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

async function ensureUniqueChatName(chatDb, uid, name) {
  const snap = await chatDb.collection("users").where("name", "==", name).get();
  return !snap.docs.some(doc => doc.id !== uid);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!hasMainFirebaseConfig()) {
    return res.status(500).json({ error: "Service not configured" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const action = url.searchParams.get("action") || url.pathname.split("/").pop();
  if (action !== "rename") {
    return res.status(404).json({ error: "Unknown action" });
  }

  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: "Missing auth token" });

  try {
    const token = match[1];
    const decoded = await getChatAuth().verifyIdToken(token);
    const chatDb = getChatDb();
    const configSnap = await chatDb.collection("config").doc("global").get();
    const config = configSnap.exists ? configSnap.data() : {};
    if (config.namesLocked) {
      return res.status(423).json({ error: "Display names are frozen by admin." });
    }

    const { name } = await readJsonBody(req);
    const validation = validateChatName(name);
    if (!validation.ok) return res.status(400).json({ error: validation.error });

    const userRef = chatDb.collection("users").doc(decoded.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ error: "Chat user not found" });
    if (!(await ensureUniqueChatName(chatDb, decoded.uid, validation.name))) {
      return res.status(409).json({ error: "Name taken, try another." });
    }

    const userData = userSnap.data();
    const previousName = userData.name ?? userData.username ?? "";
    if (previousName !== validation.name) {
      await renameUserHistory(chatDb, {
        uid: decoded.uid,
        previousName,
        nextName: validation.name,
      });
      await userRef.set({ name: validation.name, uid: decoded.uid }, { merge: true });
    }

    return res.status(200).json({ ok: true, name: validation.name });
  } catch (error) {
    console.error("chat-profile rename failed", error);
    return res.status(500).json({ error: "Rename failed" });
  }
}
