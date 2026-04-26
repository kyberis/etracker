import { redirect } from "next/navigation";

import { AppNav } from "@/components/app-nav";
import { getAuthSession } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="bg-muted/30 min-h-screen">
      <AppNav />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
