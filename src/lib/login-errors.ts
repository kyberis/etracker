import type { Locale } from "@/lib/i18n/locale";

/**
 * Maps NextAuth `?error=` query values to user-facing messages.
 * @see https://next-auth.js.org/configuration/pages#sign-in-page
 */
export function loginErrorMessage(
  code: string | null,
  locale: Locale = "es",
): string | null {
  if (!code) return null;
  if (locale === "en") {
    switch (code) {
      case "OAuthSignin":
      case "OAuthCallback":
      case "OAuthCreateAccount":
      case "Callback":
        return "Could not sign in with Google. Try again or use email and password.";
      case "OAuthAccountNotLinked":
        return "This Google account is not linked. Sign in with email and password first, or use the same email on Google.";
      case "EmailCreateAccount":
        return "Could not create an account with this email.";
      case "CredentialsSignin":
        return "Wrong email or password.";
      case "SessionRequired":
        return "You need to sign in to continue.";
      case "Configuration":
        return "Sign-in is misconfigured. Check the server environment variables.";
      case "AccessDenied":
        return "Access denied. Google must verify your email.";
      case "AccountDisabled":
        return "Your account is disabled. Contact the administrator to reactivate it.";
      default:
        return "Something went wrong signing in. Try again.";
    }
  }
  switch (code) {
    case "OAuthSignin":
    case "OAuthCallback":
    case "OAuthCreateAccount":
    case "Callback":
      return "No se pudo iniciar sesión con Google. Probá de nuevo o usá correo y contraseña.";
    case "OAuthAccountNotLinked":
      return "Esta cuenta de Google no está vinculada. Iniciá sesión con correo y contraseña primero, o usá el mismo correo en Google.";
    case "EmailCreateAccount":
      return "No se pudo crear una cuenta con este correo.";
    case "CredentialsSignin":
      return "Correo o contraseña incorrectos.";
    case "SessionRequired":
      return "Tenés que iniciar sesión para continuar.";
    case "Configuration":
      return "El inicio de sesión no está bien configurado. Revisá las variables de entorno del servidor.";
    case "AccessDenied":
      return "No se permitió el acceso. Google tiene que verificar tu correo.";
    case "AccountDisabled":
      return "Tu cuenta está desactivada. Contactá al administrador para reactivarla.";
    default:
      return "Algo salió mal al iniciar sesión. Probá de nuevo.";
  }
}
