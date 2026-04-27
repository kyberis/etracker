import { LoginForm } from "./login-form";
import { isGoogleAuthConfigured } from "@/lib/auth-providers";

export default function LoginPage() {
  return <LoginForm googleEnabled={isGoogleAuthConfigured()} />;
}
