import { z } from "zod";

import { assertOpenBankingAvailable } from "@/lib/enable-banking/access";
import { listAspsps } from "@/lib/enable-banking/client";
import { withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";

const querySchema = z.object({
  country: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase()),
});

export async function GET(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    await assertOpenBankingAvailable(userId);
    const url = new URL(request.url);
    const { country } = querySchema.parse({
      country: url.searchParams.get("country") ?? "",
    });
    const aspsps = await listAspsps({ userId, country });
    return {
      aspsps: aspsps.map((a) => ({
        name: a.name,
        country: a.country,
        maximumConsentValidity: a.maximum_consent_validity ?? null,
      })),
    };
  });
}
