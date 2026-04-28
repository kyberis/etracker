import Link from "next/link";

import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Link
        href="/login"
        className="focus-visible:ring-ring focus-visible:ring-offset-background mb-8 rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        aria-label="Clara"
      >
        <Logo size="lg" />
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
