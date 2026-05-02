const TITLE_SUFFIX_PATTERNS = [
  /\s*[-|:]\s*Free Online.*$/i,
  /\s*[-|:]\s*Play on .*$/i,
  /\s*[-|:]\s*Apps on .*$/i,
  /\s*[-|:]\s*App on .*$/i,
  /\s*[-|:]\s*Download .*$/i,
];

const STRIP_SCRIPT_SOURCES = [
  /\/\/sexcams\.plus\//i,
  /\/\/jjgirls\.com\/sex\/ChaturbateCams/i,
  /\/\/connect\.facebook\.net\/en_US\/sdk\.js/i,
  /^\/js\/main\.js$/i,
  /^\/js\/all(?:\.min)?\.js$/i,
  /^\/sdk\.js$/i,
  /^\/cloak\.js$/i,
];

const STRIP_LINK_HREFS = [
  /^\/favicon\.ico$/i,
  /^\/media\/graphics\/misc\/favicon\.ico$/i,
  /^\/resources\/logo_128\.png$/i,
  /^\/assets\/LFPaymentMonero\.png$/i,
];

const TAG_RULES = [
  { tag: "Driving", match: /\b(car|cars|drive|drift|truck|taxi|parking|moto|motor|bike|racing 3d|highway|traffic|madalin|burnin|rally)\b/i },
  { tag: "Racing", match: /\b(race|racing|kart|track|formula|nascar|grand prix|speedway)\b/i },
  { tag: "Sports", match: /\b(bowl|soccer|football|basket|baseball|golf|tennis|pool|hockey|boxing|wrestling|skate|ping pong|fishing|foosball)\b/i },
  { tag: "Shooter", match: /\b(shooter|sniper|gun|strike|doom|quake|arena|wars|warfare|zombie|counter|bullet|fps|1v1)\b/i },
  { tag: "Puzzle", match: /\b(puzzle|2048|sudoku|chess|mahjong|escape|mine sweeper|minesweeper|riddle|match)\b/i },
  { tag: "Idle", match: /\b(idle|clicker|tycoon|incremental)\b/i },
  { tag: "Sandbox", match: /\b(sandbox|craft|minecraft|voxel|worldbox|terraria)\b/i },
  { tag: "Sim", match: /\b(sim|simulator|life|manager|business|story|surgeon|proxy)\b/i },
  { tag: "Art", match: /\b(paint|draw|color|colour|silk)\b/i },
  { tag: "Action", match: /\b(fighter|fight|combat|ninja|samurai|trigger|metal slug|fnaf|slender|adventure|brawl|attack)\b/i },
];

const CONTROL_BY_TAG = {
  Racing: "WASD / Arrow keys",
  Driving: "WASD / Arrow keys",
  Arcade: "Mouse / Keyboard",
  Sports: "Mouse / Keyboard",
  Puzzle: "Mouse / Keyboard",
  Shooter: "Mouse + Keyboard",
  Sandbox: "WASD + Mouse",
  Action: "Mouse / Keyboard",
  Idle: "Mouse",
  Sim: "Mouse / Keyboard",
  Art: "Mouse / Touch",
};

const PLAYERS_BY_TAG = {
  Sports: "1–2",
  Arcade: "1",
  Racing: "1",
  Driving: "1",
  Puzzle: "1",
  Shooter: "1",
  Sandbox: "1",
  Action: "1",
  Idle: "1",
  Sim: "1",
  Art: "1",
};

function humanizeStem(stem) {
  return stem
    .replace(/^cl/i, "")
    .replace(/\.html?$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function cleanTitle(title) {
  let cleaned = title.trim();

  for (const pattern of TITLE_SUFFIX_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  return cleaned.replace(/\s+/g, " ").trim();
}

export function normaliseTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function slugify(filename) {
  return filename
    .replace(/^cl/i, "")
    .replace(/\.html?$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function repoRootFromBaseHref(baseHref) {
  try {
    return new URL("../", baseHref).href;
  } catch {
    return "";
  }
}

function generateDescription(title, tag) {
  const tagText = tag.toLowerCase();
  return `${title} is a browser-ready ${tagText} pick from the UGS archive, imported directly into the Ascenta library.`;
}

export function extractTitleFromHtml(html, fallbackStem) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const stripped = cleanTitle(titleMatch[1].replace(/<[^>]+>/g, " "));
    if (stripped) {
      return stripped;
    }
  }

  return cleanTitle(humanizeStem(fallbackStem));
}

export function rewriteRootAssetUrls(html) {
  const baseMatch = html.match(/<base[^>]+href=["']([^"']+)["']/i);
  const repoRoot = repoRootFromBaseHref(baseMatch?.[1] || "");
  if (!repoRoot) {
    return html;
  }

  return html.replace(
    /((?:src|href)=["'])\/([^"']+)(["'])/gi,
    (_match, prefix, assetPath, suffix) => `${prefix}${new URL(assetPath, repoRoot).href}${suffix}`,
  );
}

export function sanitizeImportedHtml(html) {
  return html
    .replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src) => {
      return STRIP_SCRIPT_SOURCES.some((pattern) => pattern.test(src)) ? "" : match;
    })
    .replace(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (match, href) => {
      return STRIP_LINK_HREFS.some((pattern) => pattern.test(href)) ? "" : match;
    });
}

export function inferTag(title) {
  for (const rule of TAG_RULES) {
    if (rule.match.test(title)) {
      return rule.tag;
    }
  }

  return "Arcade";
}

export function buildPackageGameRecord({ filename, html, basePath }) {
  const title = cleanTitle(extractTitleFromHtml(html, filename));
  const tag = inferTag(title);
  const id = slugify(filename);
  const desc = generateDescription(title, tag);

  return {
    id,
    title,
    tag,
    desc,
    long: desc,
    controls: CONTROL_BY_TAG[tag] || CONTROL_BY_TAG.Arcade,
    players: PLAYERS_BY_TAG[tag] || "1",
    path: `${basePath}${id}/`,
  };
}

export function buildLibrary({ manualGames, packageGames, basePath }) {
  const manualTitleKeys = new Set(manualGames.map((game) => normaliseTitle(game.title)));
  const generatedGames = [];

  for (const entry of packageGames) {
    const record = {
      ...buildPackageGameRecord({ ...entry, basePath }),
      ...(entry.id ? { id: entry.id } : {}),
      ...(entry.title ? { title: cleanTitle(entry.title) } : {}),
    };
    record.tag = inferTag(record.title);
    record.desc = generateDescription(record.title, record.tag);
    record.long = record.desc;
    record.controls = CONTROL_BY_TAG[record.tag] || CONTROL_BY_TAG.Arcade;
    record.players = PLAYERS_BY_TAG[record.tag] || "1";
    record.path = `${basePath}${record.id}/`;
    const titleKey = normaliseTitle(record.title);

    if (manualTitleKeys.has(titleKey)) {
      continue;
    }

    manualTitleKeys.add(titleKey);
    generatedGames.push(record);
  }

  generatedGames.sort((left, right) => left.title.localeCompare(right.title));

  return [...manualGames, ...generatedGames];
}
