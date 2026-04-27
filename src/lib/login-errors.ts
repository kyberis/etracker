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
      return "Could not sign in with Google. Try again or use email and password.";
    case "OAuthAccountNotLinked":
      return "This Google account is not linked to an eTracker user. Sign in with your email and password first, or use the same email for Google.";
    case "EmailCreateAccount":
      return "Could not create an account with this email.";
    case "CredentialsSignin":
      return "Invalid email or password.";
    case "SessionRequired":
      return "You need to sign in to continue.";
    case "Configuration":
      return "Sign-in is misconfigured. Check server environment variables.";
    case "AccessDenied":
      return "Sign in was denied. Google must verify your email.";
    default:
      return "Something went wrong while signing in. Please try again.";
  }
}
