const CHAT_NAME_RE = /^[a-zA-Z0-9_.\- ]+$/;
const FIRESTORE_BATCH_LIMIT = 450;

function chunk(items, size = FIRESTORE_BATCH_LIMIT) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function commitOperations(chatDb, operations) {
  for (const part of chunk(operations)) {
    const batch = chatDb.batch();
    for (const op of part) {
      if (op.type === "delete") {
        batch.delete(op.ref);
      } else {
        batch.update(op.ref, op.data);
      }
    }
    await batch.commit();
  }
}

export function validateChatName(rawName) {
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name) return { ok: false, error: "Enter a name." };
  if (name.length < 2) return { ok: false, error: "Name needs at least 2 characters." };
  if (!CHAT_NAME_RE.test(name)) return { ok: false, error: "Letters, numbers, _ . - only." };
  return { ok: true, name };
}

export function buildChatBanKey(rawName) {
  const { ok, name } = validateChatName(rawName);
  if (!ok) return "";
  return name.toLowerCase().replace(/\s+/g, "_");
}

export function renameSystemHistoryText(text, previousName, nextName) {
  if (!text || !previousName || !nextName || previousName === nextName) return null;
  const prefix = new RegExp(`^${escapeRegExp(previousName)}( created \".+\" 🎉)$`);
  if (!prefix.test(text)) return null;
  return text.replace(prefix, `${nextName}$1`);
}

export async function removeUserFromGroups(chatDb, uid) {
  const groupsSnap = await chatDb.collection("groups").where("members", "array-contains", uid).get();
  const operations = [];
  let updatedGroups = 0;
  let deletedGroups = 0;

  for (const doc of groupsSnap.docs) {
    const data = doc.data();
    const nextMembers = (Array.isArray(data.members) ? data.members : []).filter(memberUid => memberUid !== uid);
    if (nextMembers.length === 0) {
      operations.push({ type: "delete", ref: doc.ref });
      deletedGroups += 1;
      continue;
    }
    operations.push({ type: "update", ref: doc.ref, data: { members: nextMembers } });
    updatedGroups += 1;
  }

  await commitOperations(chatDb, operations);
  return { updatedGroups, deletedGroups };
}

export async function renameUserHistory(chatDb, { uid, previousName, nextName }) {
  const [authoredMessagesSnap, systemMessagesSnap] = await Promise.all([
    chatDb.collectionGroup("messages").where("from", "==", uid).get(),
    previousName && previousName !== nextName
      ? chatDb.collectionGroup("messages").where("system", "==", true).get()
      : Promise.resolve({ docs: [] }),
  ]);

  const operations = [];
  let renamedMessages = 0;
  let renamedSystemMessages = 0;

  for (const doc of authoredMessagesSnap.docs) {
    const data = doc.data();
    if (data.fromName === nextName) continue;
    operations.push({ type: "update", ref: doc.ref, data: { fromName: nextName } });
    renamedMessages += 1;
  }

  for (const doc of systemMessagesSnap.docs) {
    const data = doc.data();
    const nextText = renameSystemHistoryText(data.text, previousName, nextName);
    if (!nextText || nextText === data.text) continue;
    operations.push({ type: "update", ref: doc.ref, data: { text: nextText } });
    renamedSystemMessages += 1;
  }

  await commitOperations(chatDb, operations);
  return { renamedMessages, renamedSystemMessages };
}
