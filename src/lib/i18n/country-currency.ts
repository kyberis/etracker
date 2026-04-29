/**
 * Curated list of countries used by the onboarding wizard to seed the
 * default primary currency. Latam first (the primary audience), then
 * EU + UK + US + Canada + the few non-Latam currencies we already see
 * mentioned in the chat agent. Anything outside the list falls through
 * to the "Otro / no listado" option, which leaves the currency picker
 * open for manual input.
 *
 * `code` is ISO-3166 alpha-2 (uppercase). `currency` is ISO-4217 (3
 * letters, uppercase). Labels are in Spanish to match the rest of the
 * app copy.
 *
 * The flag emoji is regional indicators derived from the country code,
 * computed once and stored inline so the wizard can render flags
 * without pulling in an extra dep.
 */

export type CountryOption = {
  /** ISO-3166 alpha-2 country code, uppercase. */
  code: string;
  /** Spanish display name. */
  name: string;
  /** ISO-4217 currency code, uppercase. */
  currency: string;
  /** Currency display label in Spanish (e.g. "Peso argentino"). */
  currencyLabel: string;
  /** Pre-computed regional indicator flag emoji. */
  flag: string;
};

function flag(code: string): string {
  // Regional Indicator Symbol Letter A = U+1F1E6, "A" = 0x41.
  const base = 0x1f1e6 - "A".charCodeAt(0);
  return String.fromCodePoint(...code.toUpperCase().split("").map((c) => base + c.charCodeAt(0)));
}

const RAW: ReadonlyArray<Omit<CountryOption, "flag">> = [
  // Latam
  { code: "AR", name: "Argentina", currency: "ARS", currencyLabel: "Peso argentino" },
  { code: "UY", name: "Uruguay", currency: "UYU", currencyLabel: "Peso uruguayo" },
  { code: "CL", name: "Chile", currency: "CLP", currencyLabel: "Peso chileno" },
  { code: "BR", name: "Brasil", currency: "BRL", currencyLabel: "Real brasileño" },
  { code: "MX", name: "México", currency: "MXN", currencyLabel: "Peso mexicano" },
  { code: "CO", name: "Colombia", currency: "COP", currencyLabel: "Peso colombiano" },
  { code: "PE", name: "Perú", currency: "PEN", currencyLabel: "Sol peruano" },
  { code: "VE", name: "Venezuela", currency: "VES", currencyLabel: "Bolívar venezolano" },
  { code: "EC", name: "Ecuador", currency: "USD", currencyLabel: "Dólar estadounidense" },
  { code: "BO", name: "Bolivia", currency: "BOB", currencyLabel: "Boliviano" },
  { code: "PY", name: "Paraguay", currency: "PYG", currencyLabel: "Guaraní paraguayo" },
  { code: "CR", name: "Costa Rica", currency: "CRC", currencyLabel: "Colón costarricense" },
  { code: "PA", name: "Panamá", currency: "PAB", currencyLabel: "Balboa / USD" },
  { code: "DO", name: "República Dominicana", currency: "DOP", currencyLabel: "Peso dominicano" },
  { code: "GT", name: "Guatemala", currency: "GTQ", currencyLabel: "Quetzal" },
  { code: "HN", name: "Honduras", currency: "HNL", currencyLabel: "Lempira" },
  { code: "SV", name: "El Salvador", currency: "USD", currencyLabel: "Dólar estadounidense" },
  { code: "NI", name: "Nicaragua", currency: "NIO", currencyLabel: "Córdoba" },
  { code: "PR", name: "Puerto Rico", currency: "USD", currencyLabel: "Dólar estadounidense" },
  // North America + UK
  { code: "US", name: "Estados Unidos", currency: "USD", currencyLabel: "Dólar estadounidense" },
  { code: "CA", name: "Canadá", currency: "CAD", currencyLabel: "Dólar canadiense" },
  { code: "GB", name: "Reino Unido", currency: "GBP", currencyLabel: "Libra esterlina" },
  // Eurozone (alphabetical inside the bucket)
  { code: "ES", name: "España", currency: "EUR", currencyLabel: "Euro" },
  { code: "DE", name: "Alemania", currency: "EUR", currencyLabel: "Euro" },
  { code: "FR", name: "Francia", currency: "EUR", currencyLabel: "Euro" },
  { code: "IT", name: "Italia", currency: "EUR", currencyLabel: "Euro" },
  { code: "PT", name: "Portugal", currency: "EUR", currencyLabel: "Euro" },
  { code: "NL", name: "Países Bajos", currency: "EUR", currencyLabel: "Euro" },
  { code: "BE", name: "Bélgica", currency: "EUR", currencyLabel: "Euro" },
  { code: "IE", name: "Irlanda", currency: "EUR", currencyLabel: "Euro" },
  { code: "AT", name: "Austria", currency: "EUR", currencyLabel: "Euro" },
  // Other Europe
  { code: "CH", name: "Suiza", currency: "CHF", currencyLabel: "Franco suizo" },
  { code: "SE", name: "Suecia", currency: "SEK", currencyLabel: "Corona sueca" },
  { code: "NO", name: "Noruega", currency: "NOK", currencyLabel: "Corona noruega" },
  { code: "DK", name: "Dinamarca", currency: "DKK", currencyLabel: "Corona danesa" },
  { code: "PL", name: "Polonia", currency: "PLN", currencyLabel: "Zloty polaco" },
  // Asia + Oceania
  { code: "AU", name: "Australia", currency: "AUD", currencyLabel: "Dólar australiano" },
  { code: "NZ", name: "Nueva Zelanda", currency: "NZD", currencyLabel: "Dólar neozelandés" },
  { code: "JP", name: "Japón", currency: "JPY", currencyLabel: "Yen japonés" },
  { code: "IL", name: "Israel", currency: "ILS", currencyLabel: "Nuevo shéquel" },
];

export const COUNTRY_OPTIONS: ReadonlyArray<CountryOption> = RAW.map((row) => ({
  ...row,
  flag: flag(row.code),
}));

const BY_CODE = new Map(COUNTRY_OPTIONS.map((c) => [c.code.toUpperCase(), c]));

/**
 * Returns the suggested ISO-4217 currency for a given ISO-3166 alpha-2
 * code, or `null` when the country is not in the curated list. Callers
 * should fall back to the user's existing primary currency in that
 * case.
 */
export function currencyForCountry(code: string | null | undefined): string | null {
  if (!code) return null;
  const match = BY_CODE.get(code.toUpperCase());
  return match?.currency ?? null;
}

/**
 * Returns the curated country option for the code, or `null` if not in
 * the list.
 */
export function getCountryOption(code: string | null | undefined): CountryOption | null {
  if (!code) return null;
  return BY_CODE.get(code.toUpperCase()) ?? null;
}
