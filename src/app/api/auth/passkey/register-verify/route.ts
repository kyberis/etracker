import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import { db } from "@/lib/db";
import { getAuthSession } from "@/lib/auth";
import {
  getChallengeFromRequest,
  getExpiredChallengeCookieConfig,
  getWebAuthnConfig,
} from "@/lib/webauthn";

/**
 * Step 2 of passkey enrollment. Verifies the attestation produced by
 * `navigator.credentials.create()` and persists the resulting public
 * key + counter. The label is supplied by the user (e.g. "iPhone").
 */
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expectedChallenge = getChallengeFromRequest(req);
  if (!expectedChallenge) {
    return NextResponse.json(
      { error: "Challenge expired or missing" },
      { status: 400 },
    );
  }

  const body = (await req.json()) as {
    credential?: {
      id?: string;
      response?: { transports?: string[] };
    } & Record<string, unknown>;
    name?: string;
  };
  if (!body?.credential) {
    return NextResponse.json({ error: "Missing credential" }, { status: 400 });
  }

  const { rpID, origin } = getWebAuthnConfig({ req });

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.credential as unknown as Parameters<typeof verifyRegistrationResponse>[0]["response"],
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch (e) {
    console.error("Passkey registration failed", e);
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  const {
    credentialID,
    credentialPublicKey,
    counter,
    credentialDeviceType,
    credentialBackedUp,
  } = verification.registrationInfo;

  const existingCount = await db.passkey.count({
    where: { userId: session.user.id },
  });
  const name = (body.name && body.name.trim()) || `Passkey ${existingCount + 1}`;

  const id = isoBase64URL.fromBuffer(credentialID);

  // Upsert so re-registering the same authenticator (e.g. user clicked
  // "Add" twice) updates the counter instead of throwing on the unique id.
  await db.passkey.upsert({
    where: { id },
    update: {
      userId: session.user.id,
      credentialPublicKey: isoBase64URL.fromBuffer(credentialPublicKey),
      counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: body.credential.response?.transports ?? [],
      name,
    },
    create: {
      id,
      userId: session.user.id,
      credentialPublicKey: isoBase64URL.fromBuffer(credentialPublicKey),
      counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: body.credential.response?.transports ?? [],
      name,
    },
  });

  const response = NextResponse.json({ verified: true, id, name });
  response.cookies.set(getExpiredChallengeCookieConfig());
  return response;
}
