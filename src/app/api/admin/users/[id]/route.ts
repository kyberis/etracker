import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
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
      return jsonError("No podés desactivar tu propia cuenta.", 400);
    }

    const target = await db.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!target) {
      return jsonError("Usuario no encontrado.", 404);
    }

    const updated = await db.user.update({
      where: { id },
      data: {
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
        ...(payload.dailyAgentMessageLimit !== undefined
          ? { dailyAgentMessageLimit: payload.dailyAgentMessageLimit }
          : {}),
      },
      select: {
        id: true,
        email: true,
        isAdmin: true,
        isActive: true,
        dailyAgentMessageLimit: true,
      },
    });

    return { user: updated };
  });
}
