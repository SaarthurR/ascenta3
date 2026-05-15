import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function normalizePrivateKey(key) {
  return typeof key === "string" ? key.replace(/\\n/g, "\n") : undefined;
}

export function hasMainFirebaseConfig() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
}

export function hasChatFirebaseConfig() {
  return Boolean(
    process.env.CHAT_FIREBASE_PROJECT_ID &&
    process.env.CHAT_FIREBASE_CLIENT_EMAIL &&
    process.env.CHAT_FIREBASE_PRIVATE_KEY
  );
}

function getOrInitDefaultApp() {
  const existing = getApps().find(app => app.name === "[DEFAULT]");
  if (existing) return existing;
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
    }),
  });
}

function getOrInitChatApp() {
  const existing = getApps().find(app => app.name === "asenchata-chat");
  if (existing) return existing;
  return initializeApp({
    credential: cert({
      projectId: process.env.CHAT_FIREBASE_PROJECT_ID,
      clientEmail: process.env.CHAT_FIREBASE_CLIENT_EMAIL,
      privateKey: normalizePrivateKey(process.env.CHAT_FIREBASE_PRIVATE_KEY),
    }),
  }, "asenchata-chat");
}

export function getMainDb() {
  return getFirestore(getOrInitDefaultApp());
}

export function getMainAuth() {
  return getAuth(getOrInitDefaultApp());
}

export function getChatDb() {
  if (!hasChatFirebaseConfig()) return getMainDb();
  return getFirestore(getOrInitChatApp());
}

export function getChatAuth() {
  if (!hasChatFirebaseConfig()) return getMainAuth();
  return getAuth(getOrInitChatApp());
}
