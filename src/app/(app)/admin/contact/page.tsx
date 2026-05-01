import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/page-container";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";

type SearchParams = {
  kind?: string;
  status?: string;
  page?: string;
};

const PAGE_SIZE = 25;
const KINDS = ["PRIVACY", "ABUSE", "BUG", "GENERAL"] as const;
type Kind = (typeof KINDS)[number];

const STATUSES = ["unread", "unreplied", "archived", "all"] as const;
type Status = (typeof STATUSES)[number];

function parseKind(value: string | undefined): Kind | null {
  if (value && (KINDS as readonly string[]).includes(value)) return value as Kind;
  return null;
}

function parseStatus(value: string | undefined): Status {
  if (value && (STATUSES as readonly string[]).includes(value)) return value as Status;
  return "unread";
}

function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

/**
 * Admin bandeja for the public `/contact` form. Server component that lists
 * messages with quick filters by `kind` and `status`. The detail view at
 * `/admin/contact/[id]` lets the admin mark a message as read, replied, or
 * archived.
 */
export default async function AdminContactInbox({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getAuthSession();
  if (!session?.user?.isAdmin) {
    notFound();
  }
  const params = await searchParams;
  const kindFilter = parseKind(params.kind);
  const status = parseStatus(params.status);
  const page = parsePage(params.page);

  const where = buildWhere(kindFilter, status);
  const [total, items, counts] = await Promise.all([
    db.contactMessage.count({ where }),
    db.contactMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        kind: true,
        name: true,
        email: true,
        body: true,
        userId: true,
        readAt: true,
        repliedAt: true,
        archivedAt: true,
        createdAt: true,
      },
    }),
    db.contactMessage.groupBy({
      by: ["kind"],
      _count: { _all: true },
      where: { archivedAt: null },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const countByKind = new Map<string, number>();
  for (const c of counts) countByKind.set(c.kind, c._count._all);

  return (
    <PageContainer className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">Bandeja de contacto</h1>
        <p className="text-muted-foreground text-sm">
          Messages from /contact. Privacy / GDPR requests have a 30-day SLA.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <FilterGroup label="Tipo">
          <FilterLink href={buildHref(null, status, 1)} active={kindFilter === null}>
            Todos
          </FilterLink>
          {KINDS.map((k) => (
            <FilterLink
              key={k}
              href={buildHref(k, status, 1)}
              active={kindFilter === k}
              badge={countByKind.get(k) ?? 0}
            >
              {k}
            </FilterLink>
          ))}
        </FilterGroup>

        <FilterGroup label="Estado">
          {STATUSES.map((s) => (
            <FilterLink
              key={s}
              href={buildHref(kindFilter, s, 1)}
              active={status === s}
            >
              {STATUS_LABELS[s]}
            </FilterLink>
          ))}
        </FilterGroup>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mensajes ({total})</CardTitle>
          <CardDescription>
            Page {page} of {totalPages}.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>De</TableHead>
                <TableHead>Mensaje</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                    Sin mensajes con ese filtro.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {m.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    </TableCell>
                    <TableCell>
                      <span className="bg-muted rounded-md px-2 py-0.5 text-xs font-medium">
                        {m.kind}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/contact/${m.id}`}
                        className="hover:underline"
                      >
                        <span className="block font-medium">{m.name}</span>
                        <span className="text-muted-foreground block text-xs">
                          {m.email}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[420px]">
                      <Link
                        href={`/admin/contact/${m.id}`}
                        className="text-muted-foreground line-clamp-2 text-sm hover:text-foreground"
                      >
                        {m.body}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      <StatusBadges
                        readAt={m.readAt}
                        repliedAt={m.repliedAt}
                        archivedAt={m.archivedAt}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pagination
        kind={kindFilter}
        status={status}
        page={page}
        totalPages={totalPages}
      />
    </PageContainer>
  );
}

function buildWhere(kind: Kind | null, status: Status) {
  const where: {
    kind?: Kind;
    archivedAt?: Date | null;
    readAt?: null;
    repliedAt?: null;
  } = {};
  if (kind) where.kind = kind;
  if (status === "unread") {
    where.archivedAt = null;
    where.readAt = null;
  } else if (status === "unreplied") {
    where.archivedAt = null;
    where.repliedAt = null;
  } else if (status === "archived") {
    where.archivedAt = { not: null } as unknown as Date;
  }
  // "all" — no extra filter
  return where;
}

function buildHref(kind: Kind | null, status: Status, page: number): string {
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  if (status !== "unread") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return `/admin/contact${qs ? `?${qs}` : ""}`;
}

const STATUS_LABELS: Record<Status, string> = {
  unread: "Sin leer",
  unreplied: "Sin responder",
  archived: "Archivados",
  all: "Todos",
};

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-border/60 flex flex-wrap items-center gap-1 rounded-xl border p-1">
      <span className="text-muted-foreground px-2 text-xs font-medium uppercase tracking-wide">
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterLink({
  href,
  active,
  badge,
  children,
}: {
  href: string;
  active: boolean;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors " +
        (active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted")
      }
    >
      {children}
      {badge !== undefined ? (
        <span className="ml-1 opacity-75">({badge})</span>
      ) : null}
    </Link>
  );
}

function StatusBadges({
  readAt,
  repliedAt,
  archivedAt,
}: {
  readAt: Date | null;
  repliedAt: Date | null;
  archivedAt: Date | null;
}) {
  if (archivedAt) {
    return <span className="text-muted-foreground">Archivado</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className={readAt ? "text-muted-foreground" : "text-foreground font-medium"}>
        {readAt ? "Read" : "Unread"}
      </span>
      <span className={repliedAt ? "text-muted-foreground" : "text-good"}>
        {repliedAt ? "Respondido" : "Pendiente"}
      </span>
    </div>
  );
}

function Pagination({
  kind,
  status,
  page,
  totalPages,
}: {
  kind: Kind | null;
  status: Status;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
      {page > 1 ? (
        <Link
          href={buildHref(kind, status, page - 1)}
          className="rounded-lg border px-3 py-1.5 hover:bg-muted"
        >
          ← Anterior
        </Link>
      ) : null}
      <span>
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link
          href={buildHref(kind, status, page + 1)}
          className="rounded-lg border px-3 py-1.5 hover:bg-muted"
        >
          Siguiente →
        </Link>
      ) : null}
    </div>
  );
}
