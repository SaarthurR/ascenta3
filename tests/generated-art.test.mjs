import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = {};
await import("../lib/generated-art.js");

const { buildBadgeText, generateGameArt } = globalThis.window.ASCENTA_GENERATED_ART;

test("buildBadgeText derives initials from readable titles", () => {
  assert.equal(
    buildBadgeText({ id: "10minutestildawn", title: "10 Minutes Till Dawn | Seraph" }),
    "10M",
  );
  assert.equal(
    buildBadgeText({ id: "wordle", title: "Wordle" }),
    "WO",
  );
});

test("buildBadgeText falls back to id tokens when titles are noisy", () => {
  assert.equal(
    buildBadgeText({ id: "omegalayers", title: "&Omega;-L&lambda;&gamma;ers" }),
    "OM",
  );
  assert.equal(
    buildBadgeText({ id: "cats-love-cake-2", title: "🐱❤️🍰 2️⃣" }),
    "CL",
  );
});

test("generateGameArt is deterministic for the same game record", () => {
  const game = { id: "wordle", title: "Wordle", tag: "Puzzle" };
  assert.deepEqual(generateGameArt(game), generateGameArt(game));
});

test("generateGameArt creates distinct visuals for different games", () => {
  const first = generateGameArt({ id: "wordle", title: "Wordle", tag: "Puzzle" });
  const second = generateGameArt({ id: "retrobowl", title: "Retro Bowl", tag: "Sports" });

  assert.notEqual(first.bg, second.bg);
  assert.notEqual(first.svg, second.svg);
});

test("generateGameArt returns a complete svg payload", () => {
  const art = generateGameArt({ id: "100roomsofenemies", title: "100 Rooms Of Enemies", tag: "Arcade" });

  assert.match(art.bg, /^linear-gradient/);
  assert.match(art.svg, /^<svg/);
  assert.match(art.svg, /100|1R|RO|OF|EN|AR/);
});
