import { format } from "date-fns";
import { redirect } from "next/navigation";

/** App home: current month dashboard for all clients. Open the assistant via the header icon. */
export default async function DashboardIndexPage() {
  const month = format(new Date(), "yyyy-MM");
  redirect(`/m/${month}`);
}
