/**
 * Pure (client+server safe) i18n entry point. Re-exports the locale type
 * and a synchronous `getDict` lookup. For server-only helpers that read the
 * authenticated user / cookies / headers, see `./server`.
 */

import { es, type Dict } from "./dictionaries/es";
import { en } from "./dictionaries/en";
import { DEFAULT_LOCALE, type Locale } from "./locale";

export type { Dict } from "./dictionaries/es";
export {
  LOCALES,
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_LABELS,
  type Locale,
  isLocale,
  normalizeLocale,
  toBcp47,
  pickFromAcceptLanguage,
} from "./locale";

const DICTIONARIES: Record<Locale, Dict> = {
  es,
  en,
};

/**
 * Synchronous dictionary lookup. Both dictionaries are bundled — picking
 * one is a cheap object reference. We don't lazy-import them because they
 * are small and tree-shaking would be defeated for one component reaching
 * into both anyway.
 */
export function getDict(locale: Locale = DEFAULT_LOCALE): Dict {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}
