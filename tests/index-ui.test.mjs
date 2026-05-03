import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("library controls stay accessible while browsing the catalog", () => {
  assert.match(indexHtml, /\.search-row\s*\{[\s\S]*position:\s*sticky;/);
  assert.match(indexHtml, /id="backToTop"/);
});

test("hub script wires the back-to-top control to the library scroller", () => {
  assert.match(indexHtml, /const backToTop=document\.getElementById\('backToTop'\);/);
  assert.match(indexHtml, /hub\.scrollTo\(\{top:0,behavior:'smooth'\}\)/);
  assert.match(indexHtml, /hub\.addEventListener\('scroll',\s*syncBackToTopVisibility\)/);
});
