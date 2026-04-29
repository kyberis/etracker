import { redirect } from "next/navigation";

import { Logo } from "@/components/logo";
import { getAuthSession } from "@/lib/auth";

/**
 * Layout dedicado al wizard de onboarding. No usa `AppShell` porque el wizard
 * es una experiencia full-page sin navegación; la pantalla queda focalizada
 * en los pasos. Auth-guarded igual que `(app)`: si no hay sesión, mandamos a
 * `/login` (con el redirect al wizard una vez logueado, pero registramos en
 * el `register-form` directamente, así que esto es solo defense-in-depth).
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <main className="relative flex min-h-screen flex-col bg-background px-4 py-8">
      <header className="mx-auto w-full max-w-3xl">
        <Logo size="md" />
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-1 items-start justify-center pt-6 pb-12 sm:pt-12">
        {children}
      </div>
    </main>
  );
}
