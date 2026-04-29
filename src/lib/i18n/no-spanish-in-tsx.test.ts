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
  // The offline page is served by the SW for any route and prerenders
  // statically (no request context), so the metadata ships bilingual.
  // The body itself reads navigator.language from the client.
  "src/app/offline/page.tsx",
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

/**
 * Replace balanced calls to inline-i18n helpers (`pick`, `tr`, `tx`) with
 * an empty placeholder, preserving line numbers so reported offenders still
 * point at the right line. We need a balanced-paren walk because the call
 * arguments contain object literals whose values are template strings or
 * other expressions that a naive regex cannot match.
 */
function stripInlineI18nCalls(source: string): string {
  const helperRe = /\b(pick|tr|tx)\s*\(/g;
  const out = source.split("");
  let m: RegExpExecArray | null;
  while ((m = helperRe.exec(source)) !== null) {
    const startInner = m.index + m[0].length;
    let depth = 1;
    let i = startInner;
    let inString: '"' | "'" | "`" | null = null;
    let escaped = false;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === inString) {
          inString = null;
        }
      } else if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
      } else if (ch === "(") {
        depth += 1;
      } else if (ch === ")") {
        depth -= 1;
      }
      i += 1;
    }
    // Replace the call's argument body with spaces/newlines, keeping line breaks
    // so reported line numbers stay accurate.
    for (let k = startInner; k < i - 1; k++) {
      out[k] = source[k] === "\n" ? "\n" : " ";
    }
  }
  return out.join("");
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
    const cleaned = stripInlineI18nCalls(stripCommentsAndImports(raw));
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
