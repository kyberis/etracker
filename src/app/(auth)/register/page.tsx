import { RegisterForm } from "./register-form";
import IdpSignupRedirect from "./idp-signup-redirect";
import { isGoogleAuthConfigured } from "@/lib/auth-providers";
import { shouldSendUsersToUnifiedIdp } from "@/lib/idp-base";
import { resolveClaraUiLocalesForIdpAuthorize } from "@/lib/i18n/trefolio-ecosystem-locale-cookie";

type RegisterSearchParams = {
  callbackUrl?: string | string[];
  error?: string | string[];
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<RegisterSearchParams>;
}) {
  const sp = await searchParams;
  const rawErr = sp?.error;
  const oauthError = Array.isArray(rawErr) ? rawErr[0] : rawErr;
  if (shouldSendUsersToUnifiedIdp() && !oauthError) {
    const raw = sp?.callbackUrl;
    const callback = Array.isArray(raw) ? raw[0] : raw;
    const uiLocales = await resolveClaraUiLocalesForIdpAuthorize();
    return <IdpSignupRedirect callbackUrl={callback} uiLocales={uiLocales} />;
  }
  return <RegisterForm googleEnabled={isGoogleAuthConfigured()} />;
}
