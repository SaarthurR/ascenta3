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
  assert.match(indexHtml, /<div class="ffc-title">AscentaCompass<\/div>/);
  assert.match(indexHtml, /Track your grades &amp; academic progress/);
  assert.match(indexHtml, /<div class="lock-or-divider"><span>or enter an access code<\/span><\/div>/);
});

test("landing screen exposes the free chat card before authentication", () => {
  assert.match(indexHtml, /id="chatEntry"/);
  assert.match(indexHtml, /<div class="ffc-title">AscentChat<\/div>/);
  assert.match(indexHtml, /DMs &amp; group chats with anyone at school/);
});

test("grade compass uses the hosted ascenta compass url inside the iframe stage", () => {
  assert.match(indexHtml, /const GRADE_COMPASS_URL='https:\/\/ascentacompass\.vercel\.app\/';/);
  assert.match(indexHtml, /const gradeCompassEntry=document\.getElementById\('gradeCompassEntry'\);/);
  assert.match(indexHtml, /gradeCompassEntry\.addEventListener\('click',launchGradeCompass\);/);
  assert.match(indexHtml, /openStage\(\{\s*title:'AscentaCompass',/);
  assert.match(indexHtml, /src:GRADE_COMPASS_URL,/);
  assert.doesNotMatch(indexHtml, /window\.open\(GRADE_COMPASS_URL,'_blank','noopener'\)/);
});

test("hub injects Emerald Chat as the first featured game card and launches it inside the iframe stage", () => {
  assert.match(indexHtml, /const FEATURED_GAME=\{/);
  assert.match(indexHtml, /id:'umingle'/);
  assert.match(indexHtml, /title:'Emerald Chat'/);
  assert.match(indexHtml, /desc:'Free schoolwide chat is live — message anyone at school, no code needed\.'/);
  assert.match(indexHtml, /path:'https:\/\/emeraldchat\.com\/'/);
  assert.match(indexHtml, /externalLink:'https:\/\/emeraldchat\.com\/'/);
  assert.match(indexHtml, /const HUB_GAMES=\[FEATURED_GAME,\s*\.\.\.GAMES\];/);
  assert.match(indexHtml, /HUB_GAMES\.forEach\(g=>\{/);
  assert.match(indexHtml, /openStage\(\{\s*title:currentGame\.title,/);
  assert.match(indexHtml, /src:currentGame\.path,/);
  assert.doesNotMatch(indexHtml, /window\.open\(currentGame\.externalLink \|\| currentGame\.path,'_blank','noopener'\)/);
});
