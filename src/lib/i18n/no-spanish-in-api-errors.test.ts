import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Companion to `no-spanish-in-tsx.test.ts`. Scans backend code that ships
 * strings to international users (API route handlers, AI tool descriptions,
 * shared HTTP helpers) for stray Spanish-only diacritics.
 *
 * The Clara product is bilingual: marketing/UI copy lives in localized
 * dictionaries (`src/lib/i18n/{es,en}.ts`), and the AI agent honours the
 * user's locale at the system-prompt level. Letting raw Spanish leak from
 * API errors or tool schemas is the most common drift vector.
 *
 * We allow:
 *  - Comments (block + single-line).
 *  - Import paths.
 *  - Files that are explicitly Spanish-content (whitelisted below).
 */

const SPANISH_RE = /[áéíóúñÁÉÍÓÚÑ¿¡]/;

const REPO_ROOT = path.resolve(__dirname, "../../..");

/**
 * Files that legitimately contain Spanish text and should not be linted.
 * Add new entries here with a one-line justification.
 */
const IGNORED_FILES = new Set<string>([
  // Bilingual marketing copy (parallel ES/EN content lives in this file).
  "src/lib/marketing-content.ts",
  // Email templates that are explicitly localized per user.
  "src/lib/email-i18n.ts",
  // i18n dictionaries.
  "src/lib/i18n/es.ts",
  "src/lib/i18n/en.ts",
  "src/lib/i18n/locale.ts",
  "src/lib/i18n/errors.ts",
  // The Spanish system prompt and locale-keyed prompt blocks.
  "src/lib/ai/prompts.ts",
  // Localized Telegram menu strings.
  "src/lib/telegram/menu.ts",
  // Stripe Checkout `product_data` mirrors the user's locale (ES strings
  // intentionally contain diacritics).
  "src/app/api/billing/checkout/route.ts",
]);

/**
 * Glob patterns to scan, relative to the repo root. We intentionally limit
 * the scope to backend boundaries (API + AI agent + shared helpers) — the
 * UI layer is covered by `no-spanish-in-tsx.test.ts`.
 */
const GLOBS = [
  "src/app/api/**/route.ts",
  "src/lib/ai/**/*.ts",
  "src/lib/http.ts",
  "src/lib/mcp/**/*.ts",
];

function listFiles(): string[] {
  try {
    const out = execSync(
      `git ls-files ${GLOBS.map((g) => `'${g}'`).join(" ")}`,
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
      },
    );
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((file) => !file.endsWith(".test.ts"));
  } catch {
    return [];
  }
}

function stripCommentsAndImports(source: string): string {
  let cleaned = source;
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, (match) =>
    match
      .split("\n")
      .map(() => "")
      .join("\n"),
  );
  cleaned = cleaned.replace(/^\s*\/\/.*$/gm, "");
  cleaned = cleaned.replace(
    /^\s*import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm,
    "",
  );
  return cleaned;
}

describe("no Spanish characters in API + AI tool layer", () => {
  const files = listFiles();

  it("collected at least one file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  const offenders: { file: string; line: number; text: string }[] = [];

  for (const file of files) {
    if (IGNORED_FILES.has(file)) continue;

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

  it("does not contain Spanish-only diacritics outside whitelisted files", () => {
    if (offenders.length === 0) return;
    const sample = offenders
      .slice(0, 30)
      .map((o) => `${o.file}:${o.line}  ${o.text}`)
      .join("\n");
    throw new Error(
      `Found ${offenders.length} Spanish-character occurrence(s) in API/AI layer.\n` +
        `Translate to neutral English (or whitelist the file in IGNORED_FILES if it must stay Spanish).\n\n` +
        sample,
    );
  });
});
