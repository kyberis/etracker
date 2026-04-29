import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{ month?: string }>;
};

/**
 * `/chat` is kept as an alias for backwards compatibility (existing PWA links
 * and bookmarks). Redirect to the new home, preserving `?month=` so deep
 * links still scope the assistant to a specific month.
 */
export default async function ChatAliasPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const monthQs =
    typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month)
      ? `?month=${encodeURIComponent(sp.month)}`
      : "";
  redirect(`/app${monthQs}`);
}
