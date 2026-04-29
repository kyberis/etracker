import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Defense in depth: catches stray Spanish characters in `*.tsx` files outside
 * the i18n folder. We don't strictly forbid Spanish (some marketing copy,
 * comments, JSON-LD strings legitimately contain it), but we want to keep
 * raw user-facing copy in the dictionaries.
 *
 * Heuristic: flag JSX text + plain string literals containing Spanish-only
 * diacritics (`á é í ó ú ñ ¿ ¡`). Allow exceptions:
 *  - block comments (often have non-localised explanatory text)
 *  - single-line comments
 *  - import paths
 *  - a curated `IGNORED_FILES` list for legitimate non-localised content
 *    (OG images render Spanish text directly into a PNG, etc.).
 */

const SPANISH_RE = /[áéíóúñÁÉÍÓÚÑ¿¡]/;

const REPO_ROOT = path.resolve(__dirname, "../../..");

const IGNORED_FILES = new Set<string>([
  // OG/Twitter images render Spanish text directly into the PNG via satori.
  // The English variant lives in (marketing)/[lang]/opengraph-image.tsx.
  "src/app/opengraph-image.tsx",
  // Marketing pages embed JSON-LD whose values come from marketing-content.
  // The localized copy is in marketing-content; these wrappers are fine.
]);

function listTsxFiles(): string[] {
  // Use git ls-files for speed and to honour .gitignore. Fall back to find
  // when not in a git repo (e.g. published artefact).
  try {
    const out = execSync("git ls-files 'src/**/*.tsx'", {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function stripCommentsAndImports(source: string): string {
  let cleaned = source;
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, "");
  cleaned = cleaned.replace(/^\s*\/\/.*$/gm, "");
  cleaned = cleaned.replace(/^\s*import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "");
  return cleaned;
}

describe("no Spanish characters in *.tsx outside i18n", () => {
  const files = listTsxFiles();

  it("collected at least one tsx file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  const offenders: { file: string; line: number; text: string }[] = [];

  for (const file of files) {
    if (file.startsWith("src/lib/i18n/")) continue;
    if (IGNORED_FILES.has(file)) continue;
    if (file.endsWith(".test.tsx")) continue;

    const abs = path.join(REPO_ROOT, file);
    let raw: string;
    try {
      raw = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const cleaned = stripCommentsAndImports(raw);
    const lines = cleaned.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!SPANISH_RE.test(line)) continue;
      offenders.push({ file, line: i + 1, text: line.trim().slice(0, 200) });
    }
  }

  it("does not contain Spanish-only diacritics outside i18n", () => {
    if (offenders.length === 0) return;
    const sample = offenders
      .slice(0, 30)
      .map((o) => `${o.file}:${o.line}  ${o.text}`)
      .join("\n");
    throw new Error(
      `Found ${offenders.length} Spanish-character occurrence(s) in TSX outside src/lib/i18n.\n` +
        `Move strings into the dictionaries (es.ts/en.ts) or whitelist the file in IGNORED_FILES if it's legitimately non-localised.\n\n` +
        sample,
    );
  });
});
