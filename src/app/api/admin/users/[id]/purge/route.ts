import { jsonError, withApi } from "@/lib/http";
import { purgeUserNow } from "@/lib/account-deletion-server";
import { db } from "@/lib/db";
import { log } from "@/lib/log";
import { requireAdminUserId } from "@/lib/session";

/**
 * Admin-only "Purge now" — bypasses the 30-day grace window for a
 * soft-deleted account. Used when a user contacts support waiving their
 * grace, or when an account needs to disappear sooner than the cron.
 *
 * Guardrails:
 *  - Only soft-deleted rows can be force-purged. Active accounts must
 *    soft-delete first; that path goes through the user's own re-auth and
 *    Stripe cancellation, which we don't want to bypass from the admin
 *    panel by mistake.
 *  - An admin cannot purge themselves (matches the `isActive` toggle
 *    guardrail in the same panel).
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const adminId = await requireAdminUserId();
    const { id } = await context.params;

    if (id === adminId) {
      return jsonError("You cannot purge your own account.", 400);
    }

    const target = await db.user.findUnique({
      where: { id },
      select: { id: true, email: true, deletedAt: true },
    });
    if (!target) {
      return jsonError("User not found.", 404);
    }
    if (!target.deletedAt) {
      return jsonError(
        "Only soft-deleted accounts can be purged. Ask the user to soft-delete first.",
        409,
      );
    }

    log.info("account_purge_now.admin_invoked", {
      adminId,
      targetId: id,
      targetEmail: target.email,
      softDeletedAt: target.deletedAt.toISOString(),
    });

    const result = await purgeUserNow(id, "force_admin");
    return { ok: true, purged: result.purged };
  });
}
