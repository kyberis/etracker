import { LoginForm } from "./login-form";
import IdpAutoRedirect from "./idp-auto-redirect";
import { isGoogleAuthConfigured } from "@/lib/auth-providers";
import { shouldSendUsersToUnifiedIdp } from "@/lib/idp-base";

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
  if (shouldSendUsersToUnifiedIdp() && !oauthError) {
    const raw = sp?.callbackUrl;
    const callback = Array.isArray(raw) ? raw[0] : raw;
    return <IdpAutoRedirect callbackUrl={callback} />;
  }
  return <LoginForm googleEnabled={isGoogleAuthConfigured()} />;
}
