import { enUS, es } from "date-fns/locale";
import type { Locale as DateLocale } from "date-fns";

import { toBcp47, type Locale } from "./locale";

/** date-fns locale matching the i18n locale. */
export function dateLocale(locale: Locale): DateLocale {
  return locale === "en" ? enUS : es;
}

/** BCP-47 string for `Intl.NumberFormat` / `Intl.DateTimeFormat`. */
export function intlLocale(locale: Locale): string {
  return toBcp47(locale);
}
