import { getAuthSession } from "@/lib/auth";

export async function requireUserId() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }
  return session.user.id;
}
