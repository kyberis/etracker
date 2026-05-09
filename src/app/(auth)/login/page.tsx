import { isGoogleAuthConfigured } from "@/lib/auth-providers";
import { isClaraIdpOAuthConfigured } from "@/lib/idp-base";
import { resolveClaraUiLocalesForIdpAuthorize } from "@/lib/i18n/trefolio-ecosystem-locale-cookie";
import { LoginForm } from "./login-form";
import { IdpUnifiedBridge } from "./idp-unified-bridge";

type LoginSearchParams = {
  callbackUrl?: string | string[];
  error?: string | string[];
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>;
}) {
  const sp = await searchParams;
  const rawErr = sp?.error;
  const oauthError = Array.isArray(rawErr) ? rawErr[0] : rawErr;
  const raw = sp?.callbackUrl;
  const callback = Array.isArray(raw) ? raw[0] : raw;
  const uiLocales = await resolveClaraUiLocalesForIdpAuthorize();

  if (isClaraIdpOAuthConfigured()) {
    return (
      <IdpUnifiedBridge
        callbackUrl={callback}
        uiLocales={uiLocales}
        error={oauthError}
      />
    );
  }

  return <LoginForm googleEnabled={isGoogleAuthConfigured()} />;
}
