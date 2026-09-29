import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { sendRegistrationApprovedEmail } from "@/lib/registration-approved-email";
import { requireAdminUserId } from "@/lib/session";
import { adminUpdateUserSchema } from "@/lib/validators";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const adminId = await requireAdminUserId();
    const { id } = await context.params;
    const body = await request.json();
    const payload = adminUpdateUserSchema.parse(body);

    // Guardrail: don't let an admin lock themselves out of the panel.
    if (id === adminId && payload.isActive === false) {
      return jsonError("You cannot disable your own account.", 400);
    }

    const target = await db.user.findUnique({
      where: { id },
      select: { id: true, email: true, locale: true, registrationApprovedAt: true },
    });
    if (!target) {
      return jsonError("Usuario no encontrado.", 404);
    }

    const shouldApprove =
      payload.registrationApproved === true && !target.registrationApprovedAt;

    const updated = await db.user.update({
      where: { id },
      data: {
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
        ...(payload.dailyAgentMessageLimit !== undefined
          ? { dailyAgentMessageLimit: payload.dailyAgentMessageLimit }
          : {}),
        ...(shouldApprove ? { registrationApprovedAt: new Date() } : {}),
      },
      select: {
        id: true,
        email: true,
        isAdmin: true,
        isActive: true,
        dailyAgentMessageLimit: true,
        registrationApprovedAt: true,
      },
    });

    if (shouldApprove) {
      void sendRegistrationApprovedEmail({
        email: target.email,
        locale: target.locale,
      });
    }

    return { user: updated };
  });
}
