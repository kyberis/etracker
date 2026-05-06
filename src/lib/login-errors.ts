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
        return "Could not complete sign-in with your trefolio account. Try again, or clear site cookies for this app and the login page if it keeps failing.";
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
      case "EmailNotVerified":
        return "Confirm your email first. We sent you a link when you signed up — check your inbox (and spam).";
      case "VerificationFailed":
        return "The verification link is invalid or has expired. Sign up again to get a new one.";
      default:
        return "Something went wrong signing in. Try again.";
    }
  }
  switch (code) {
    case "OAuthSignin":
    case "OAuthCallback":
    case "OAuthCreateAccount":
    case "Callback":
      return "No se pudo completar el inicio de sesión con tu cuenta trefolio. Probá de nuevo o borrá las cookies de este sitio y de la página de login si sigue fallando.";
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
    case "EmailNotVerified":
      return "Confirmá tu email primero. Te mandamos un enlace al registrarte — revisá tu casilla (y la carpeta de spam).";
    case "VerificationFailed":
      return "El enlace de verificación es inválido o venció. Registrate de nuevo para recibir uno nuevo.";
    default:
      return "Algo salió mal al iniciar sesión. Probá de nuevo.";
  }
}
