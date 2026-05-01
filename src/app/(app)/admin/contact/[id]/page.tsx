import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/page-container";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";

import { ContactMessageActions } from "./actions";

type PageProps = { params: Promise<{ id: string }> };

/**
 * Detail view for a single message in `/admin/contact`. Marks the row as
 * read on first open (idempotent) and exposes buttons to flip
 * `repliedAt` / `archivedAt`. Reusing the same `PATCH /api/admin/contact/[id]`
 * endpoint keeps the data path narrow.
 */
export default async function AdminContactDetail({ params }: PageProps) {
  const session = await getAuthSession();
  if (!session?.user?.isAdmin) {
    notFound();
  }
  const { id } = await params;

  const message = await db.contactMessage.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, email: true, name: true, isAdmin: true, createdAt: true },
      },
    },
  });
  if (!message) notFound();

  // Auto-mark as read when the admin opens the detail. Best-effort: a
  // failed update is not worth the user-visible error.
  if (!message.readAt) {
    try {
      await db.contactMessage.update({
        where: { id },
        data: { readAt: new Date() },
      });
    } catch {
      /* ignore */
    }
  }

  return (
    <PageContainer className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/contact"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            ← Bandeja
          </Link>
          <h1 className="font-display mt-1 text-2xl font-semibold">
            {message.name}{" "}
            <span className="text-muted-foreground text-base font-normal">
              · {message.email}
            </span>
          </h1>
          <p className="text-muted-foreground text-xs">
            {message.kind} · {message.createdAt.toISOString()}
          </p>
        </div>
        <span className="bg-muted rounded-md px-2 py-1 text-xs font-medium">
          {message.kind}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mensaje</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
            {message.body}
          </pre>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Acciones</CardTitle>
          </CardHeader>
          <CardContent>
            <ContactMessageActions
              id={message.id}
              repliedAt={message.repliedAt?.toISOString() ?? null}
              archivedAt={message.archivedAt?.toISOString() ?? null}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contexto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Field label="Recibido">
              {message.createdAt.toISOString()}
            </Field>
            <Field label="Marcado leído">
              {message.readAt?.toISOString() ?? "Ahora (auto)"}
            </Field>
            <Field label="Respondido">
              {message.repliedAt?.toISOString() ?? "—"}
            </Field>
            <Field label="Archivado">
              {message.archivedAt?.toISOString() ?? "—"}
            </Field>
            <Field label="IP">{message.ip ?? "—"}</Field>
            <Field label="User-Agent">
              <span className="break-all">{message.userAgent ?? "—"}</span>
            </Field>
            <Field label="User logueado">
              {message.user ? (
                <span>
                  {message.user.email}
                  {message.user.isAdmin ? " (admin)" : ""}
                  <br />
                  <span className="text-muted-foreground text-xs">
                    {message.user.id}
                  </span>
                </span>
              ) : (
                "Anónimo"
              )}
            </Field>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </p>
      <p className="text-foreground text-sm">{children}</p>
    </div>
  );
}
