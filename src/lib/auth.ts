import bcrypt from "bcrypt";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { type NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

import { touchActivity } from "@/lib/activity";
import { db } from "@/lib/db";

import { isGoogleAuthConfigured } from "./auth-providers";

/**
 * `strategy: "jwt"` means NextAuth never reads/writes the `Session` /
 * `VerificationToken` tables — we dropped them in migration
 * `20260428220000_drop_unused_authjs_tables`. We **keep** `PrismaAdapter`
 * because it's still responsible for persisting the `User` and `Account`
 * rows on first Google sign-in (auto-linking by email is enabled below).
 */
export const authOptions: NextAuthOptions = {
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
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;

        if (!email || !password) {
          return null;
        }

        const user = await db.user.findUnique({ where: { email } });
        if (!user?.passwordHash) {
          return null;
        }
        if (!user.isActive) {
          // Default-deny: disabled accounts can't get a session.
          return null;
        }

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
          return null;
        }

        return { id: user.id, email: user.email };
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
  ],
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "google") {
        const verified = (profile as { email_verified?: boolean }).email_verified;
        // Default-deny: only proceed when Google explicitly says the email is verified.
        if (verified !== true) {
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
            return "/login?error=AccountDisabled";
          }
        }
      } else if (user?.id) {
        // Credentials path: we already filtered in `authorize`, but double-check.
        const dbUser = await db.user.findUnique({
          where: { id: user.id },
          select: { isActive: true },
        });
        if (dbUser && !dbUser.isActive) {
          return "/login?error=AccountDisabled";
        }
      }
      return true;
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.sub = user.id;
        // Fresh sign-in: mark the user as active today even if they land on
        // a route that bypasses the (app) layout (e.g. /onboarding).
        void touchActivity(user.id);
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
};

export function getAuthSession() {
  return getServerSession(authOptions);
}
