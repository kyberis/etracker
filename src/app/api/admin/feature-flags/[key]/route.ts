import {
  isFeatureFlagKey,
  setFeatureEnabled,
} from "@/lib/feature-flags";
import { jsonError, withApi } from "@/lib/http";
import { requireAdminUserId } from "@/lib/session";
import { adminFeatureFlagPatchSchema } from "@/lib/validators";

/** Admin-only: toggle the global value of a known feature flag. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ key: string }> },
) {
  return withApi(async () => {
    const adminId = await requireAdminUserId();
    const { key } = await context.params;
    if (!isFeatureFlagKey(key)) {
      return jsonError("Feature flag desconocida.", 404);
    }
    const body = adminFeatureFlagPatchSchema.parse(await request.json());
    await setFeatureEnabled(key, body.enabled, adminId);
    return { key, enabled: body.enabled };
  });
}
