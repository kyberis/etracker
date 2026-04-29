import { cn } from "@/lib/utils";

/** Centered, padded container for routes that aren't the chat home. */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-5 sm:py-8",
        className,
      )}
    >
      {children}
    </main>
  );
}
