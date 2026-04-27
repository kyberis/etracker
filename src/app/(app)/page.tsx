import { format } from "date-fns";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

function isMobileUserAgent(ua: string | null): boolean {
  if (!ua) return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

/** Mobile: land on chat; desktop: current month dashboard. Nav "Dashboard" goes to `/m/…`. */
export default async function DashboardIndexPage() {
  const ua = (await headers()).get("user-agent");
  if (isMobileUserAgent(ua)) {
    redirect("/chat");
  }
  const month = format(new Date(), "yyyy-MM");
  redirect(`/m/${month}`);
}
