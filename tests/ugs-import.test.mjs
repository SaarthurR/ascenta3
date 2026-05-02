import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLibrary,
  buildPackageGameRecord,
  extractTitleFromHtml,
  inferTag,
  sanitizeImportedHtml,
  rewriteRootAssetUrls,
} from "../lib/ugs-import.mjs";

test("extractTitleFromHtml trims common storefront suffixes", () => {
  const html = "<html><head><title>Drive Mad - Free Online Car Game</title></head></html>";

  assert.equal(extractTitleFromHtml(html, "cldrivemad"), "Drive Mad");
});

test("rewriteRootAssetUrls rebases root-relative assets against the game's repo root", () => {
  const html = `
    <html>
      <head>
        <base href="https://cdn.jsdelivr.net/gh/selenite-cc/selenite-old@abc123/retrobowl/">
        <script src="/js/all.js"></script>
        <link rel="stylesheet" href="/assets/css.css">
      </head>
    </html>
  `;

  const rewritten = rewriteRootAssetUrls(html);

  assert.match(rewritten, /https:\/\/cdn\.jsdelivr\.net\/gh\/selenite-cc\/selenite-old@abc123\/js\/all\.js/);
  assert.match(rewritten, /https:\/\/cdn\.jsdelivr\.net\/gh\/selenite-cc\/selenite-old@abc123\/assets\/css\.css/);
});

test("inferTag maps titles into the existing homepage chip taxonomy", () => {
  assert.equal(inferTag("Drive Mad"), "Driving");
  assert.equal(inferTag("Retro Bowl"), "Sports");
  assert.equal(inferTag("Space Wars Battleground"), "Shooter");
  assert.equal(inferTag("Cookie Clicker"), "Idle");
  assert.equal(inferTag("Unknown Thing"), "Arcade");
});

test("buildPackageGameRecord generates playable metadata from a package html file", () => {
  const record = buildPackageGameRecord({
    filename: "clspacewarsbattleground.html",
    html: "<html><head><title>Space Wars Battleground</title></head></html>",
    basePath: "games/base/",
  });

  assert.equal(record.id, "spacewarsbattleground");
  assert.equal(record.title, "Space Wars Battleground");
  assert.equal(record.tag, "Shooter");
  assert.equal(record.path, "games/base/spacewarsbattleground/");
  assert.equal(record.controls, "Mouse + Keyboard");
  assert.equal(record.players, "1");
});

test("buildLibrary preserves manual entries and skips package duplicates by title", () => {
  const manualGames = [
    {
      id: "retrobowl",
      title: "Retro Bowl",
      tag: "Sports",
      desc: "Manual version",
      controls: "Mouse / Drag",
      players: "1",
      path: "games/base/retrobowl/",
      art: "art-retrobowl",
    },
  ];

  const packageGames = [
    {
      filename: "clretrobowl.html",
      html: "<html><head><title>Retro Bowl</title></head></html>",
      basePath: "games/base/",
    },
    {
      filename: "clspacewarsbattleground.html",
      html: "<html><head><title>Space Wars Battleground</title></head></html>",
      basePath: "games/base/",
    },
  ];

  const library = buildLibrary({ manualGames, packageGames, basePath: "games/base/" });

  assert.equal(library.length, 2);
  assert.equal(library[0].title, "Retro Bowl");
  assert.equal(library[1].title, "Space Wars Battleground");
});

test("sanitizeImportedHtml strips junk third-party embeds and dead local helper scripts", () => {
  const html = `
    <html>
      <head>
        <script src="//sexcams.plus/embed.js"></script>
        <script src="/js/main.js"></script>
        <script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>
        <link rel="icon" href="/favicon.ico">
      </head>
    </html>
  `;

  const sanitized = sanitizeImportedHtml(html);

  assert.doesNotMatch(sanitized, /sexcams\.plus/);
  assert.doesNotMatch(sanitized, /src="\/js\/main\.js"/);
  assert.doesNotMatch(sanitized, /href="\/favicon\.ico"/);
  assert.match(sanitized, /poki-sdk\.js/);
});
