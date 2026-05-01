import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import { db } from "@/lib/db";
import { getAuthSession } from "@/lib/auth";
import {
  getChallengeCookieConfig,
  getWebAuthnConfig,
} from "@/lib/webauthn";

/**
 * Step 1 of passkey enrollment. Requires the user to be already
 * authenticated (via password / Google / existing passkey). We persist
 * the challenge in an HttpOnly cookie so the verify step can match it
 * without a server-side store.
 */
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      passkeys: { select: { id: true, transports: true } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { rpName, rpID } = getWebAuthnConfig({ req });

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: user.id,
    userName: user.email,
    userDisplayName: user.name || user.email,
    attestationType: "none",
    excludeCredentials: user.passkeys.map((pk) => ({
      id: isoBase64URL.toBuffer(pk.id),
      type: "public-key" as const,
      transports: pk.transports as AuthenticatorTransport[],
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const response = NextResponse.json(options);
  response.cookies.set(getChallengeCookieConfig(options.challenge));
  return response;
}
