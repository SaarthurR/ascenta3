import test from "node:test";
import assert from "node:assert/strict";

import {
  buildChatBanKey,
  removeUserFromGroups,
  renameUserHistory,
} from "../lib/chat-admin-identity.mjs";

function makeDoc(path, data) {
  return {
    id: path.split("/").pop(),
    ref: { path },
    data: () => structuredClone(data),
  };
}

function createFakeChatDb({ groups = [], messages = [] } = {}) {
  const committed = [];

  return {
    committed,
    batch() {
      const ops = [];
      return {
        update(ref, data) {
          ops.push({ type: "update", path: ref.path, data });
        },
        delete(ref) {
          ops.push({ type: "delete", path: ref.path });
        },
        async commit() {
          committed.push(...ops);
        },
      };
    },
    collection(name) {
      assert.equal(name, "groups");
      return {
        where(field, op, value) {
          assert.equal(field, "members");
          assert.equal(op, "array-contains");
          return {
            async get() {
              return {
                docs: groups
                  .filter(group => Array.isArray(group.members) && group.members.includes(value))
                  .map(group => makeDoc(`groups/${group.id}`, group)),
              };
            },
          };
        },
      };
    },
    collectionGroup(name) {
      assert.equal(name, "messages");
      return {
        where(field, op, value) {
          assert.equal(op, "==");
          return {
            async get() {
              let filtered = messages;
              if (field === "from") {
                filtered = messages.filter(message => message.from === value);
              } else if (field === "system") {
                filtered = messages.filter(message => message.system === value);
              } else {
                throw new Error(`Unexpected filter: ${field}`);
              }
              return {
                docs: filtered.map(message => makeDoc(message.path, message)),
              };
            },
          };
        },
      };
    },
  };
}

test("removeUserFromGroups removes a deleted member from every group and deletes empty groups", async () => {
  const chatDb = createFakeChatDb({
    groups: [
      { id: "community", members: ["alpha", "target", "beta"] },
      { id: "duo", members: ["target", "beta"] },
      { id: "solo", members: ["target"] },
    ],
  });

  const summary = await removeUserFromGroups(chatDb, "target");

  assert.deepEqual(summary, {
    updatedGroups: 2,
    deletedGroups: 1,
  });
  assert.deepEqual(chatDb.committed, [
    {
      type: "update",
      path: "groups/community",
      data: { members: ["alpha", "beta"] },
    },
    {
      type: "update",
      path: "groups/duo",
      data: { members: ["beta"] },
    },
    {
      type: "delete",
      path: "groups/solo",
    },
  ]);
});

test("renameUserHistory backfills sender names and system history entries", async () => {
  const chatDb = createFakeChatDb({
    messages: [
      {
        path: "groups/community/messages/a1",
        from: "target",
        fromName: "Old Name",
        text: "hey",
      },
      {
        path: "conversations/dm-target/messages/b2",
        from: "target",
        fromName: "Old Name",
        text: "still me",
      },
      {
        path: "groups/community/messages/c3",
        system: true,
        text: 'Old Name created "Ascenta Community" 🎉',
      },
      {
        path: "groups/community/messages/d4",
        system: true,
        text: "Someone else created this",
      },
    ],
  });

  const summary = await renameUserHistory(chatDb, {
    uid: "target",
    previousName: "Old Name",
    nextName: "New Name",
  });

  assert.deepEqual(summary, {
    renamedMessages: 2,
    renamedSystemMessages: 1,
  });
  assert.deepEqual(chatDb.committed, [
    {
      type: "update",
      path: "groups/community/messages/a1",
      data: { fromName: "New Name" },
    },
    {
      type: "update",
      path: "conversations/dm-target/messages/b2",
      data: { fromName: "New Name" },
    },
    {
      type: "update",
      path: "groups/community/messages/c3",
      data: { text: 'New Name created "Ascenta Community" 🎉' },
    },
  ]);
});

test("buildChatBanKey normalizes banned chat names consistently", () => {
  assert.equal(buildChatBanKey("Q qLkqd90G"), "q_qlkqd90g");
  assert.equal(buildChatBanKey(" You "), "you");
  assert.equal(buildChatBanKey(""), "");
});
