import { z } from "zod";

import { assertOpenBankingAvailable } from "@/lib/enable-banking/access";
import { listAspsps, startAuth } from "@/lib/enable-banking/client";
import { createOAuthState } from "@/lib/enable-banking/oauth-state";
import { withApi } from "@/lib/http";
import { log } from "@/lib/log";
import { requireUserId } from "@/lib/session";

const bodySchema = z.object({
  institutionName: z.string().min(1),
  country: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase()),
});

function consentUntil(maxSeconds: number | null | undefined): Date {
  const cap = maxSeconds && maxSeconds > 0 ? maxSeconds : 180 * 24 * 60 * 60;
  const bounded = Math.min(cap, 180 * 24 * 60 * 60);
  return new Date(Date.now() + bounded * 1000);
}

export async function POST(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    await assertOpenBankingAvailable(userId);
    const body = bodySchema.parse(await request.json());

    const aspsps = await listAspsps({ userId, country: body.country });
    const aspsp = aspsps.find(
      (item) => item.name.toLowerCase() === body.institutionName.toLowerCase(),
    );
    if (!aspsp) {
      throw new Error("CONNECTION_NOT_FOUND");
    }

    const state = createOAuthState({
      userId,
      institutionName: aspsp.name,
      institutionCountry: aspsp.country,
    });
    const validUntil = consentUntil(aspsp.maximum_consent_validity);
    log.info("enable_banking.auth.start", {
      userId,
      institutionName: aspsp.name,
      country: aspsp.country,
    });
    const { url } = await startAuth({
      userId,
      institutionName: aspsp.name,
      institutionCountry: aspsp.country,
      state,
      validUntil,
    });
    return { url };
  });
}
