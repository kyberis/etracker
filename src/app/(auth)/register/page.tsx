import { RegisterForm } from "./register-form";
import { isGoogleAuthConfigured } from "@/lib/auth-providers";

export default function RegisterPage() {
  return <RegisterForm googleEnabled={isGoogleAuthConfigured()} />;
}
