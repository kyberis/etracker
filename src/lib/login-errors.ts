/**
 * Maps NextAuth `?error=` query values to user-facing messages.
 * @see https://next-auth.js.org/configuration/pages#sign-in-page
 */
export function loginErrorMessage(code: string | null): string | null {
  if (!code) return null;
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
