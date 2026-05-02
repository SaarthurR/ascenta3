import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { MANUAL_GAMES } from "../lib/manual-games.mjs";
import {
  buildLibrary,
  extractTitleFromHtml,
  normaliseTitle,
  sanitizeImportedHtml,
  rewriteRootAssetUrls,
} from "../lib/ugs-import.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const baseGamesDir = path.join(
  repoRoot,
  "games",
  "a0d702b41fb4e59f9372b1e0e9ea8e2e2088eb2ce730472976bc496e6834d5d0",
);
const runtimeBasePath = "games/a0d702b41fb4e59f9372b1e0e9ea8e2e2088eb2ce730472976bc496e6834d5d0/";
const cacheDir = path.join(repoRoot, ".cache", "ugs-import");
const extractDir = path.join(cacheDir, "package");
const tarballPath = path.join(cacheDir, "ugs-singlefiles-1.0.6.tgz");
const catalogOutputPath = path.join(repoRoot, "lib", "generated-games.js");

async function ensurePackageExtracted() {
  await mkdir(cacheDir, { recursive: true });
  await rm(extractDir, { recursive: true, force: true });

  if (!(await fileExists(tarballPath))) {
    execFileSync("npm", ["pack", "ugs-singlefiles@1.0.6", "--silent"], {
      cwd: cacheDir,
      stdio: ["ignore", "pipe", "inherit"],
      encoding: "utf8",
    });

    const packedTarball = path.join(cacheDir, "ugs-singlefiles-1.0.6.tgz");
    if (packedTarball !== tarballPath && (await fileExists(packedTarball))) {
      await writeFile(tarballPath, await readFile(packedTarball));
    }
  }

  execFileSync("tar", ["-xzf", tarballPath, "-C", cacheDir], {
    cwd: repoRoot,
    stdio: "ignore",
  });

  return path.join(extractDir, "UGS-Files");
}

async function fileExists(targetPath) {
  try {
    await readFile(targetPath);
    return true;
  } catch {
    return false;
  }
}

function listPackageFiles(packageDir) {
  const output = execFileSync("find", [packageDir, "-maxdepth", "1", "-type", "f", "-name", "cl*.html"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
  });

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function slugFromFilename(filename) {
  return filename
    .replace(/^cl/i, "")
    .replace(/\.html?$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function copyGameFile(filePath, slug) {
  const filename = path.basename(filePath);

  const targetDir = path.join(baseGamesDir, slug);
  await mkdir(targetDir, { recursive: true });

  const rawHtml = await readFile(filePath, "utf8");
  const rewrittenHtml = sanitizeImportedHtml(rewriteRootAssetUrls(rawHtml));
  await writeFile(path.join(targetDir, "index.html"), rewrittenHtml);

  return {
    filename,
    id: slug,
    html: rewrittenHtml,
  };
}

function buildCatalogSource(library) {
  const serialized = JSON.stringify(library, null, 2);
  return `window.ASCENTA_GAME_LIBRARY = ${serialized};\n`;
}

async function main() {
  const packageDir = await ensurePackageExtracted();
  const packageFiles = listPackageFiles(packageDir);
  const packageGames = [];
  const seenTitleKeys = new Set(MANUAL_GAMES.map((game) => normaliseTitle(game.title)));
  const seenIds = new Set(MANUAL_GAMES.map((game) => game.id));

  for (const filePath of packageFiles) {
    const filename = path.basename(filePath);
    const rawHtml = await readFile(filePath, "utf8");
    const title = extractTitleFromHtml(rawHtml, filename);
    const titleKey = normaliseTitle(title);
    const slug = slugFromFilename(filename);

    if (seenTitleKeys.has(titleKey) || seenIds.has(slug)) {
      continue;
    }

    const imported = await copyGameFile(filePath, slug);
    seenTitleKeys.add(titleKey);
    seenIds.add(imported.id);
    packageGames.push({ ...imported, title });
  }

  const library = buildLibrary({
    manualGames: MANUAL_GAMES,
    packageGames,
    basePath: runtimeBasePath,
  });

  await writeFile(catalogOutputPath, buildCatalogSource(library));

  console.log(`Imported ${packageGames.length} package games`);
  console.log(`Wrote catalog with ${library.length} entries`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
