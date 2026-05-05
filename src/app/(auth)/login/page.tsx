import { LoginForm } from "./login-form";
import IdpAutoRedirect from "./idp-auto-redirect";
import { isGoogleAuthConfigured } from "@/lib/auth-providers";
import { getIdpBaseUrl } from "@/lib/idp-base";

function shouldRedirectToIdp() {
  const idpEnabled =
    Boolean(getIdpBaseUrl()) &&
    Boolean(process.env.IDP_CLIENT_ID) &&
    Boolean(process.env.IDP_CLIENT_SECRET);
  const legacyOff = process.env.USE_LEGACY_AUTH === "false";
  return idpEnabled && legacyOff;
}

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { callbackUrl?: string | string[]; error?: string | string[] };
}) {
  const rawErr = searchParams?.error;
  const oauthError = Array.isArray(rawErr) ? rawErr[0] : rawErr;
  if (shouldRedirectToIdp() && !oauthError) {
    const raw = searchParams?.callbackUrl;
    const callback = Array.isArray(raw) ? raw[0] : raw;
    return <IdpAutoRedirect callbackUrl={callback} />;
  }
  return <LoginForm googleEnabled={isGoogleAuthConfigured()} />;
}
