const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;

function documentUrl(collection, id) {
  const path = `${encodeURIComponent(collection)}/${encodeURIComponent(id)}`;
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/(default)/documents/${path}?key=${encodeURIComponent(FIREBASE_API_KEY)}`;
}

async function getDocument(collection, id) {
  const response = await fetch(documentUrl(collection, id), {
    headers: { Accept: "application/json" },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Firestore GET failed (${response.status}): ${body}`);
  }

  return response.json();
}

async function setDocument(collection, id, fields) {
  const response = await fetch(documentUrl(collection, id), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Firestore PATCH failed (${response.status}): ${body}`);
  }
}

async function deleteDocument(collection, id) {
  const response = await fetch(documentUrl(collection, id), {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });

  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Firestore DELETE failed (${response.status}): ${body}`);
  }
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string" && req.body.length > 0) {
    return JSON.parse(req.body);
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!FIREBASE_API_KEY || !FIREBASE_PROJECT_ID) {
    return res.status(500).json({
      error: "Unlock service is not configured",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { key, hwid } = await readJsonBody(req);

    if (!key || !hwid) {
      return res.status(400).json({ error: "Missing key or device fingerprint" });
    }

    const adminDoc = await getDocument("admin_keys", key);
    if (adminDoc) {
      return res.status(200).json({ status: "granted" });
    }

    const keyDoc = await getDocument("keys", key);
    if (keyDoc) {
      await setDocument("used_keys", key, {
        hwid: { stringValue: String(hwid) },
        time: { integerValue: String(Date.now()) },
      });
      await deleteDocument("keys", key);
      return res.status(200).json({ status: "granted" });
    }

    const usedDoc = await getDocument("used_keys", key);
    if (usedDoc) {
      const usedHwid = usedDoc.fields?.hwid?.stringValue ?? "";
      if (usedHwid === hwid) {
        return res.status(200).json({ status: "granted" });
      }

      return res.status(200).json({ status: "locked" });
    }

    return res.status(200).json({ status: "invalid" });
  } catch (error) {
    console.error("Unlock failed", error);
    return res.status(500).json({ error: "Unlock service failed" });
  }
};
