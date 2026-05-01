export const SESSION_COOKIE_NAME = "ascenta_session";

const SESSION_VERSION = 1;
const SESSION_MARKER = "ascenta";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes) {
  if (typeof btoa === "function") {
    let binary = "";
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
  }

  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(base64) {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  }

  return new Uint8Array(Buffer.from(base64, "base64"));
}

function toBase64Url(bytes) {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));

  return base64ToBytes(`${normalized}${padding}`);
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }

  return mismatch === 0;
}

async function signPayload(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));

  return toBase64Url(new Uint8Array(signature));
}

function serializeCookie(name, value, attributes) {
  const parts = [`${name}=${value}`];

  if (attributes.path) {
    parts.push(`Path=${attributes.path}`);
  }
  if (attributes.httpOnly) {
    parts.push("HttpOnly");
  }
  if (attributes.sameSite) {
    parts.push(`SameSite=${attributes.sameSite}`);
  }
  if (attributes.secure) {
    parts.push("Secure");
  }
  if (typeof attributes.maxAge === "number") {
    parts.push(`Max-Age=${attributes.maxAge}`);
  }

  return parts.join("; ");
}

export async function createSessionValue(secret) {
  if (!secret) {
    throw new Error("SESSION_SECRET is required");
  }

  const payload = {
    v: SESSION_VERSION,
    t: SESSION_MARKER,
    iat: Date.now(),
  };
  const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await signPayload(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export async function verifySessionValue(value, secret) {
  if (!value || !secret) {
    return false;
  }

  const segments = value.split(".");
  if (segments.length !== 2) {
    return false;
  }

  const [encodedPayload, signature] = segments;
  const expectedSignature = await signPayload(encodedPayload, secret);

  if (!timingSafeEqual(signature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(decoder.decode(fromBase64Url(encodedPayload)));

    return payload?.v === SESSION_VERSION
      && payload?.t === SESSION_MARKER
      && Number.isFinite(payload?.iat);
  } catch {
    return false;
  }
}

export function buildSessionCookie(value, { secure = false } = {}) {
  return serializeCookie(SESSION_COOKIE_NAME, value, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure,
  });
}

export function buildClearedSessionCookie({ secure = false } = {}) {
  return serializeCookie(SESSION_COOKIE_NAME, "", {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure,
    maxAge: 0,
  });
}
