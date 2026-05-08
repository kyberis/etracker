import bcrypt from "bcrypt";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { type NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import { touchActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import { notifyAdminOfNewUser } from "@/lib/signup-notify";
import { getClientIp, verifyTurnstileToken } from "@/lib/turnstile";
import {
  getChallengeFromCookieHeader,
  getWebAuthnConfig,
} from "@/lib/webauthn";

import { isGoogleAuthConfigured } from "./auth-providers";
import { getIdpBaseUrl } from "./idp-base";
import { log } from "@/lib/log";

/**
 * `strategy: "jwt"` means NextAuth never reads/writes the `Session` /
 * `VerificationToken` tables — we dropped them in migration
 * `20260428220000_drop_unused_authjs_tables`. We **keep** `PrismaAdapter`
 * because it's still responsible for persisting the `User` and `Account`
 * rows on first Google sign-in (auto-linking by email is enabled below).
 */
export const authOptions = {
  // Behind Caddy/Vercel, use X-Forwarded-Host so OAuth redirect_uri matches the browser URL.
  trustHost: true,
  adapter: PrismaAdapter(db),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        turnstileToken: { label: "Turnstile token", type: "text" },
      },
      async authorize(credentials, req) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        const emailDomain =
          email && email.includes("@") ? email.slice(email.indexOf("@") + 1) : undefined;

        if (!email || !password) {
          log.info("credentials_signin_missing_fields", {
            hasEmail: Boolean(email),
            hasPassword: Boolean(password),
          });
          return null;
        }

        // Cloudflare Turnstile is verified BEFORE bcrypt to avoid spending CPU
        // on automated brute-force attempts. The verifier is permissive on
        // localhost / when keys are missing — see `src/lib/turnstile.ts`.
        const headers = new Headers(
          (req?.headers ?? {}) as Record<string, string>,
        );
        const ip = getClientIp(headers);
        const captchaOk = await verifyTurnstileToken(
          credentials?.turnstileToken,
          ip,
          headers.get("host"),
        );
        if (!captchaOk) {
          log.info("credentials_signin_turnstile_failed", {
            emailDomain,
          });
          return null;
        }

        const user = await db.user.findUnique({ where: { email } });
        if (!user?.passwordHash) {
          log.info("credentials_signin_unknown_or_no_password", {
            emailDomain,
          });
          return null;
        }
        if (!user.isActive) {
          log.info("credentials_signin_inactive_user", {
            emailDomain,
            userIdTail: user.id.length > 8 ? `…${user.id.slice(-8)}` : "***",
          });
          // Default-deny: disabled accounts can't get a session.
          return null;
        }
        if (!user.emailVerified) {
          log.info("credentials_signin_unverified_email", {
            emailDomain,
          });
          // We surface this through `?error=EmailNotVerified` from the form
          // when `signIn` returns `error: "CredentialsSignin"` and we know
          // the user exists but isn't verified yet — but not from here, to
          // avoid leaking whether an email is registered.
          return null;
        }

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
          log.info("credentials_signin_bad_password", {
            emailDomain,
          });
          return null;
        }

        log.info("credentials_signin_ok", {
          emailDomain,
          userIdTail: user.id.length > 8 ? `…${user.id.slice(-8)}` : "***",
        });
        return { id: user.id, email: user.email };
      },
    }),
    /**
     * Passkey provider — verifies a WebAuthn assertion against a
     * previously enrolled credential and returns the matching user.
     * The challenge is read from the `clara_webauthn_challenge` cookie
     * minted by `/api/auth/passkey/login-options`.
     */
    CredentialsProvider({
      id: "passkey",
      name: "Passkey",
      credentials: {
        credential: { label: "Credential", type: "text" },
      },
      async authorize(credentials, req) {
        if (!credentials?.credential) return null;

        const headers = new Headers(
          (req?.headers ?? {}) as Record<string, string>,
        );
        const expectedChallenge = getChallengeFromCookieHeader(
          headers.get("cookie"),
        );
        if (!expectedChallenge) return null;

        let cred: {
          id?: string;
        } & Record<string, unknown>;
        try {
          cred = JSON.parse(credentials.credential);
        } catch {
          return null;
        }
        if (!cred?.id) return null;

        const passkey = await db.passkey.findUnique({
          where: { id: cred.id },
          include: { user: { select: { id: true, email: true, isActive: true } } },
        });
        if (!passkey || !passkey.user) return null;
        if (!passkey.user.isActive) return null;

        const { rpID, origin } = getWebAuthnConfig({
          host: headers.get("host"),
          protocol: headers.get("x-forwarded-proto"),
        });

        let verification;
        try {
          verification = await verifyAuthenticationResponse({
            response: cred as unknown as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            authenticator: {
              credentialID: isoBase64URL.toBuffer(passkey.id),
              credentialPublicKey: isoBase64URL.toBuffer(
                passkey.credentialPublicKey,
              ),
              counter: passkey.counter,
              transports: passkey.transports as AuthenticatorTransport[],
            },
          });
        } catch (e) {
          console.error("Passkey login verification failed", e);
          return null;
        }
        if (!verification.verified) return null;

        // Bump counter + lastUsedAt. Counter regression is already a hard
        // failure inside `verifyAuthenticationResponse`, so a successful
        // verify means the new counter is monotonically greater.
        await db.passkey.update({
          where: { id: passkey.id },
          data: {
            counter: verification.authenticationInfo.newCounter,
            lastUsedAt: new Date(),
          },
        });

        return { id: passkey.user.id, email: passkey.user.email };
      },
    }),
    ...(isGoogleAuthConfigured()
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            allowDangerousEmailAccountLinking: true,
            profile(profile) {
              const email = profile.email?.toLowerCase() ?? profile.email;
              return {
                id: profile.sub,
                name: profile.name,
                email,
                image: profile.picture,
                emailVerified: profile.email_verified ? new Date() : null,
              };
            },
          }),
        ]
      : []),
    ...(getIdpBaseUrl() &&
    process.env.IDP_CLIENT_ID &&
    process.env.IDP_CLIENT_SECRET
      ? [
          {
            id: "trefolio-id",
            name: "Trefolio Account",
            type: "oauth" as const,
            wellKnown: `${getIdpBaseUrl()}/.well-known/openid-configuration`,
            authorization: {
              params: {
                scope: "openid email profile entitlements",
                app_hint: "clara",
              },
            },
            clientId: process.env.IDP_CLIENT_ID,
            clientSecret: process.env.IDP_CLIENT_SECRET,
            idToken: true,
            checks: ["pkce", "state"] as Array<"pkce" | "state">,
            profile(profile: Record<string, unknown>) {
              const email =
                typeof profile.email === "string"
                  ? profile.email.toLowerCase()
                  : "";
              return {
                id:
                  typeof profile.sub === "string" ? profile.sub : email,
                name:
                  typeof profile.name === "string" ? profile.name : null,
                email,
                image: null,
              };
            },
          },
        ]
      : []),
  ],
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "google") {
        const verified = (profile as { email_verified?: boolean }).email_verified;
        // Default-deny: only proceed when Google explicitly says the email is verified.
        if (verified !== true) {
          log.info("google_signin_blocked_unverified_email", {});
          return "/login?error=AccessDenied";
        }
        const email = profile?.email?.toLowerCase();
        if (email) {
          const existing = await db.user.findUnique({
            where: { email },
            select: { isActive: true },
          });
          // First-ever Google login: row doesn't exist yet (the adapter creates
          // it after this hook returns true), so we let it through.
          if (existing && !existing.isActive) {
            log.info("google_signin_blocked_disabled_account", {
              emailDomain: email ? email.slice(email.indexOf("@") + 1) : undefined,
            });
            return "/login?error=AccountDisabled";
          }
        }
      } else if (account?.provider === "trefolio-id") {
        const p = profile as
          | {
              email?: string;
              name?: string;
              entitlements?: { clara_daily_limit?: number };
            }
          | undefined;
        const email = p?.email?.toLowerCase() ?? user.email?.toLowerCase();
        log.info("clara.idp_oauth_signin_attempt", {
          emailDomainHint:
            email && email.includes("@") ? email.slice(email.indexOf("@") + 1) : undefined,
        });
        if (!email) {
          log.info("clara.idp_oauth_signin_blocked_no_email", {});
          return "/login?error=AccessDenied";
        }
        const existing = await db.user.findUnique({
          where: { email },
          select: { id: true, isActive: true },
        });
        if (existing && !existing.isActive) {
          log.info("clara.idp_oauth_signin_blocked_inactive_user", {
            emailDomainHint:
              email.includes("@") ? email.slice(email.indexOf("@") + 1) : undefined,
          });
          return "/login?error=AccountDisabled";
        }
        log.info("clara.idp_oauth_signin_allowed", {
          emailDomainHint: email.includes("@") ? email.slice(email.indexOf("@") + 1) : undefined,
        });
      } else if (user?.id) {
        // Credentials path: we already filtered in `authorize`, but double-check.
        const dbUser = await db.user.findUnique({
          where: { id: user.id },
          select: { isActive: true },
        });
        if (dbUser && !dbUser.isActive) {
          log.info("credentials_signin_callback_blocked_inactive", {
            userIdTail: user.id.length > 8 ? `…${user.id.slice(-8)}` : "***",
          });
          return "/login?error=AccountDisabled";
        }
      }
      return true;
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        let uid = user.id as string | undefined;
        if (!uid && user.email) {
          const row = await db.user.findUnique({
            where: { email: user.email.toLowerCase() },
            select: { id: true },
          });
          uid = row?.id;
        }
        if (uid) {
          token.sub = uid;
          // Fresh sign-in: mark the user as active today even if they land on
          // a route that bypasses the (app) layout (e.g. /onboarding).
          void touchActivity(uid);
        }
      }
      // Refresh admin/active flags from DB on first JWT issuance and whenever
      // the client requests a session update (e.g. after admin self-service
      // changes elsewhere). We avoid querying on every request because the
      // JWT is read on every request — that would defeat the point.
      const shouldRefresh =
        Boolean(user) || trigger === "update" || token.isAdmin === undefined;
      if (shouldRefresh && token.sub) {
        const dbUser = await db.user.findUnique({
          where: { id: token.sub },
          select: { isAdmin: true, isActive: true },
        });
        if (dbUser) {
          token.isAdmin = dbUser.isAdmin;
          token.isActive = dbUser.isActive;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.isAdmin = Boolean(token.isAdmin);
        session.user.isActive = token.isActive ?? true;
      }
      return session;
    },
  },
  events: {
    /**
     * Fires once per user when the adapter creates the row (Google or IdP OAuth).
     * Credentials registration notifies from `POST /api/auth/register` instead.
     */
    async createUser({ user }) {
      if (!user?.id || !user.email) return;
      void notifyAdminOfNewUser({
        userId: user.id,
        email: user.email,
        source: "oauth",
      });
    },
    /**
     * Runs after a successful sign-in. IdP entitlements are applied here so
     * brand-new OAuth users exist in the DB before we touch quotas (the
     * `signIn` callback can run too early for first-time adapter inserts).
     */
    async signIn(message) {
      const { user, account, profile } = message;
      if (account?.provider !== "trefolio-id" || !user?.email) return;
      const p = profile as
        | {
            sub?: string;
            entitlements?: { clara_daily_limit?: number };
            name?: string;
          }
        | undefined;
      const email = user.email.toLowerCase();
      const dailyLimit = Number(p?.entitlements?.clara_daily_limit) || 30;
      const idpSub = typeof p?.sub === "string" && p.sub.length > 0 ? p.sub : undefined;
      await db.user.updateMany({
        where: { email },
        data: {
          dailyAgentMessageLimit: dailyLimit,
          ...(p?.name ? { name: p.name } : {}),
          ...(idpSub ? { idpSub } : {}),
        },
      });
    },
  },
} as NextAuthOptions;

export function getAuthSession() {
  return getServerSession(authOptions);
}
