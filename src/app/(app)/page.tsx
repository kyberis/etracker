import { format } from "date-fns";
import { redirect } from "next/navigation";

export default function DashboardIndexPage() {
  const month = format(new Date(), "yyyy-MM");
  redirect(`/m/${month}`);
}
