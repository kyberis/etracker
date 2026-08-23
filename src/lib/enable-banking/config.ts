/**
 * Enable Banking env boundary. Missing vars degrade gracefully: the
 * Settings section is hidden and API routes throw ENABLE_BANKING_NOT_CONFIGURED.
 */

export type EnableBankingEnv = "sandbox" | "production";

const DEFAULT_API_BASE = "https://api.enablebanking.com";

function readPem(raw: string | undefined): string {
  if (!raw) return "";
  return raw.replace(/\\n/g, "\n").trim();
}

export function getEnableBankingEnv(): EnableBankingEnv {
  return process.env.ENABLE_BANKING_ENV === "production"
    ? "production"
    : "sandbox";
}

export function getEnableBankingApiBase(): string {
  const override = process.env.ENABLE_BANKING_API_BASE?.trim();
  if (override) return override.replace(/\/+$/, "");
  return DEFAULT_API_BASE;
}

export function getEnableBankingAppId(): string {
  return process.env.ENABLE_BANKING_APP_ID?.trim() ?? "";
}

export function getEnableBankingPrivateKey(): string {
  return readPem(process.env.ENABLE_BANKING_PRIVATE_KEY);
}

export function getEnableBankingRedirectUrl(): string {
  const explicit = process.env.ENABLE_BANKING_REDIRECT_URL?.trim();
  if (explicit) return explicit;
  const origin =
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "";
  if (!origin) return "";
  return `${origin.replace(/\/+$/, "")}/api/open-banking/callback`;
}

export function isEnableBankingEnabled(): boolean {
  return Boolean(
    getEnableBankingAppId() &&
      getEnableBankingPrivateKey() &&
      getEnableBankingRedirectUrl() &&
      process.env.BANK_SYNC_ENCRYPTION_KEY?.trim(),
  );
}

export function assertEnableBankingConfigured(): void {
  if (!isEnableBankingEnabled()) {
    throw new Error("ENABLE_BANKING_NOT_CONFIGURED");
  }
}
