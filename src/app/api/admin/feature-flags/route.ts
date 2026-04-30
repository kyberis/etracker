import {
  isFeatureFlagKey,
  listFeatureFlags,
} from "@/lib/feature-flags";
import { withApi } from "@/lib/http";
import { requireAdminUserId } from "@/lib/session";

/**
 * Admin-only: list every flag in the registry with its current state.
 * Not cached (admins get a fresh read on every page load).
 */
export async function GET() {
  return withApi(async () => {
    await requireAdminUserId();
    const flags = await listFeatureFlags();
    return { flags };
  });
}

/** Re-export so static analysis sees the helper as used. */
export { isFeatureFlagKey };
