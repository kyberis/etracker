import { SignJWT, jwtVerify } from "jose";
import { UserKind } from "@prisma/client";

import { isClaraIdpOAuthConfigured } from "@/lib/idp-base";

const PURPOSE = "clara_registration_approval";
const TTL_SECONDS = 60 * 60 * 24 * 7;

export function requiresRegistrationApproval(): boolean {
  const v = process.env.REGISTRATION_REQUIRES_APPROVAL?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return true;
}

export function isRegistrationApproved(user: {
  kind?: UserKind | string | null;
  registrationApprovedAt?: Date | string | null;
}): boolean {
  if (user.kind === UserKind.GUEST || user.kind === "GUEST") return true;
  if (!requiresRegistrationApproval()) return true;
  const at = user.registrationApprovedAt;
  if (!at) return false;
  if (at instanceof Date) return !Number.isNaN(at.getTime());
  return String(at).trim().length > 0;
}

/**
 * New REGULAR users stay pending only on self-hosted / legacy auth.
 * Unified IdP already gated them before issuing tokens.
 */
export function registrationApprovedAtForCreate(opts?: {
  guest?: boolean;
}): Date | null {
  if (opts?.guest) return new Date();
  if (!requiresRegistrationApproval()) return new Date();
  if (isClaraIdpOAuthConfigured()) return new Date();
  return null;
}

function getSecret(): Uint8Array {
  const secret =
    process.env.APP_SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "APP_SESSION_SECRET (or NEXTAUTH_SECRET) is required to sign approval tokens.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createRegistrationApprovalJwt(args: {
  userId: string;
  email: string;
}): Promise<string> {
  return new SignJWT({ userId: args.userId, email: args.email, purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyRegistrationApprovalJwt(token: string): Promise<{
  userId: string;
  email: string;
} | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    if (payload.purpose !== PURPOSE) return null;
    const userId = typeof payload.userId === "string" ? payload.userId : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    if (!userId || !email) return null;
    return { userId, email };
  } catch {
    return null;
  }
}
