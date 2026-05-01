import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Service worker is hand-authored vanilla JS shipped as-is.
    "public/sw.js",
  ]),
  // Discourage stray console calls. Files that legitimately log
  // (the AI logger, the centralized log helper, and webhook routes) opt
  // out below.
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: [
      "src/lib/log.ts",
      "src/lib/ai/logger.ts",
      "src/app/api/webhooks/**/*.ts",
    ],
    rules: { "no-console": "off" },
  },
]);

export default eslintConfig;
