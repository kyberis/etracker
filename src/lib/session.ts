import { touchActivity } from "@/lib/activity";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function requireUserId() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }
  // Fire-and-forget: this writes at most once per UTC day per user, so the
  // common case is a no-op read. We don't await to avoid adding latency to
  // every authenticated API call.
  void touchActivity(session.user.id);
  return session.user.id;
}

/**
 * Like `requireUserId` but returns `null` when there is no session
 * instead of throwing. Use for endpoints that have a public branch and
 * a logged-in branch (e.g. share-link accept).
 */
export async function getOptionalUserId(): Promise<string | null> {
  const session = await getAuthSession();
  const id = session?.user?.id ?? null;
  if (id) void touchActivity(id);
  return id;
}

/**
 * Asserts the caller is signed in **and** has `isAdmin = true` in the DB.
 * Throws `Error("UNAUTHORIZED")` for unauthenticated callers and
 * `Error("FORBIDDEN")` for non-admins. `withApi` maps these to 401/403.
 *
 * We re-check the flag against the DB (not just the JWT) so an admin
 * demoted via SQL or a partner action loses access on the next call,
 * even before their JWT expires.
 */
export async function requireAdminUserId() {
  const userId = await requireUserId();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true, isActive: true },
  });
  if (!user || !user.isActive || !user.isAdmin) {
    throw new Error("FORBIDDEN");
  }
  return userId;
}
