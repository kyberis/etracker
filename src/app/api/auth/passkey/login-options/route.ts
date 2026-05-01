import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";

import {
  getChallengeCookieConfig,
  getWebAuthnConfig,
} from "@/lib/webauthn";

/**
 * Step 1 of passkey sign-in. We don't take an email — modern browsers
 * surface every resident credential available on the device, so the
 * server only needs to mint a challenge and remember it via cookie.
 */
export async function POST(req: NextRequest) {
  const { rpID } = getWebAuthnConfig({ req });

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  });

  const response = NextResponse.json(options);
  response.cookies.set(getChallengeCookieConfig(options.challenge));
  return response;
}
