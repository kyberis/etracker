import { db } from "@/lib/db";
import { withApi } from "@/lib/http";
import { createRequisition } from "@/lib/revolut/gocardless";
import { getAppBaseUrl } from "@/lib/revolut/app-url";
import { requireUserId } from "@/lib/session";
import { revolutConnectSchema } from "@/lib/validators";

export async function POST(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = revolutConnectSchema.parse(body);

    const redirect = `${getAppBaseUrl()}/revolut/callback`;
    const requisition = await createRequisition({
      institutionId: payload.institutionId,
      redirect,
      reference: userId,
    });

    await db.revolutConnection.upsert({
      where: { userId },
      create: {
        userId,
        requisitionId: requisition.id,
        institutionId: payload.institutionId,
        status: "PENDING",
      },
      update: {
        requisitionId: requisition.id,
        institutionId: payload.institutionId,
        status: "PENDING",
        accountId: null,
      },
    });

    return { link: requisition.link, requisitionId: requisition.id };
  });
}
