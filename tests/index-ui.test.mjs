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

test("hub no longer exposes a separate AscentaCompass free-access panel", () => {
  assert.doesNotMatch(indexHtml, /id="gradeCompassPanel"/);
  assert.doesNotMatch(indexHtml, /AscentaCompass is available from the free side of Ascenta/);
});

test("landing screen exposes AscentaCompass before authentication", () => {
  assert.match(indexHtml, /id="gradeCompassEntry"/);
  assert.match(indexHtml, /Access AscentaCompass to track grades\./);
  assert.match(indexHtml, /id="terminalTabUnlock"/);
  assert.match(indexHtml, /id="terminalTabCompass"/);
  assert.match(indexHtml, /data-panel="unlock"/);
  assert.match(indexHtml, /data-panel="compass"/);
  assert.match(indexHtml, /const terminalTabs=\[\.\.\.document\.querySelectorAll\('\.access-tab'\)\];/);
  assert.match(indexHtml, /function setAccessPanel\(panel\)/);
});

test("landing screen advertises the new Omegle addition before authentication", () => {
  assert.match(indexHtml, /New! Omegle added\./);
  assert.match(indexHtml, /Get a code now to use it\./);
  assert.match(indexHtml, /#lock\.flying \.lock-announcement[\s\S]*animation:auxFade 500ms ease forwards;/);
});

test("grade compass uses the hosted ascenta compass url and opens outside the iframe", () => {
  assert.match(indexHtml, /const GRADE_COMPASS_URL='https:\/\/ascentacompass\.vercel\.app\/';/);
  assert.match(indexHtml, /const gradeCompassEntry=document\.getElementById\('gradeCompassEntry'\);/);
  assert.match(indexHtml, /gradeCompassEntry\.addEventListener\('click',launchGradeCompass\);/);
  assert.match(indexHtml, /window\.open\(GRADE_COMPASS_URL,'_blank','noopener'\)/);
});

test("hub injects Umingle as the first featured game card and opens it outside the iframe", () => {
  assert.match(indexHtml, /const FEATURED_GAME=\{/);
  assert.match(indexHtml, /title:'Umingle'/);
  assert.match(indexHtml, /desc:'New! Omegle is back in the hub — jump in once you have a code\.'/);
  assert.match(indexHtml, /path:'https:\/\/umingle\.com\/'/);
  assert.match(indexHtml, /launchMode:'external'/);
  assert.match(indexHtml, /const HUB_GAMES=\[FEATURED_GAME,\s*\.\.\.GAMES\];/);
  assert.match(indexHtml, /HUB_GAMES\.forEach\(g=>\{/);
  assert.match(indexHtml, /window\.open\(currentGame\.externalLink \|\| currentGame\.path,'_blank','noopener'\)/);
});
