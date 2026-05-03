import test from "node:test";
import assert from "node:assert/strict";

import { MANUAL_GAMES } from "../lib/manual-games.mjs";

globalThis.window = {};
await import("../lib/generated-games.js");

function findById(games, id) {
  return games.find((game) => game.id === id);
}

test("manual and generated catalogs preserve curated titles for renamed games", () => {
  const manualMinecraft = findById(MANUAL_GAMES, "mncrft");
  const manualKimJongUn = findById(MANUAL_GAMES, "kimjongun");
  const generatedMinecraft = findById(window.ASCENTA_GAME_LIBRARY, "mncrft");
  const generatedKimJongUn = findById(window.ASCENTA_GAME_LIBRARY, "kimjongun");

  assert.equal(manualMinecraft?.title, "Minecraft");
  assert.equal(manualKimJongUn?.title, "Kim Jong Un Puzzle");
  assert.equal(generatedMinecraft?.title, "Minecraft");
  assert.equal(generatedKimJongUn?.title, "Kim Jong Un Puzzle");
});
