import { describe, expect, it } from "vitest";

import { es } from "./dictionaries/es";
import { en } from "./dictionaries/en";

type AnyRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectKeys(value: unknown, prefix = ""): string[] {
  if (typeof value === "function") return [prefix];
  if (Array.isArray(value)) return [prefix];
  if (!isPlainObject(value)) return [prefix];
  return Object.keys(value)
    .sort()
    .flatMap((k) => collectKeys(value[k], prefix ? `${prefix}.${k}` : k));
}

function collectShape(value: unknown, prefix = ""): { path: string; type: string }[] {
  const out: { path: string; type: string }[] = [];
  if (typeof value === "function") return [{ path: prefix, type: "function" }];
  if (Array.isArray(value)) return [{ path: prefix, type: "array" }];
  if (typeof value === "string") return [{ path: prefix, type: "string" }];
  if (typeof value === "number") return [{ path: prefix, type: "number" }];
  if (typeof value === "boolean") return [{ path: prefix, type: "boolean" }];
  if (!isPlainObject(value)) return [{ path: prefix, type: "other" }];
  for (const k of Object.keys(value).sort()) {
    out.push(...collectShape(value[k], prefix ? `${prefix}.${k}` : k));
  }
  return out;
}

describe("i18n dictionaries", () => {
  it("ES and EN have the same keys", () => {
    const esKeys = collectKeys(es).sort();
    const enKeys = collectKeys(en).sort();
    const onlyEs = esKeys.filter((k) => !enKeys.includes(k));
    const onlyEn = enKeys.filter((k) => !esKeys.includes(k));
    expect(onlyEs, `Missing in EN: ${onlyEs.join(", ")}`).toHaveLength(0);
    expect(onlyEn, `Extra in EN: ${onlyEn.join(", ")}`).toHaveLength(0);
  });

  it("ES and EN share the same primitive shape (string/function/etc.)", () => {
    const esShape = new Map(collectShape(es).map((s) => [s.path, s.type]));
    const enShape = new Map(collectShape(en).map((s) => [s.path, s.type]));
    const mismatches: string[] = [];
    for (const [path, esType] of esShape) {
      const enType = enShape.get(path);
      if (enType && enType !== esType) {
        mismatches.push(`${path}: es=${esType} en=${enType}`);
      }
    }
    expect(mismatches, `Type mismatches:\n${mismatches.join("\n")}`).toHaveLength(0);
  });
});
