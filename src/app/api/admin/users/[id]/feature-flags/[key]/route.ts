import { db } from "@/lib/db";
import {
  isFeatureFlagKey,
  setUserFeatureOverride,
} from "@/lib/feature-flags";
import { jsonError, withApi } from "@/lib/http";
import { requireAdminUserId } from "@/lib/session";
import { adminFeatureFlagOverrideSchema } from "@/lib/validators";

/**
 * Admin-only: set or clear a per-user override for a feature flag.
 * Lets admins dogfood a flag for themselves before flipping it globally.
 *
 * Body: `{ enabled: boolean | null }` — passing `null` deletes the override
 * so the user falls back to the global value.
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string; key: string }> },
) {
  return withApi(async () => {
    await requireAdminUserId();
    const { id, key } = await context.params;
    if (!isFeatureFlagKey(key)) {
      return jsonError("Feature flag desconocida.", 404);
    }
    const target = await db.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!target) {
      return jsonError("Usuario no encontrado.", 404);
    }
    const body = adminFeatureFlagOverrideSchema.parse(await request.json());
    await setUserFeatureOverride(key, id, body.enabled);
    return { userId: id, key, enabled: body.enabled };
  });
}
