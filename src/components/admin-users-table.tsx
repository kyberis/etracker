"use client";

import { format } from "date-fns";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT, useTx } from "@/lib/i18n/client";

export type AdminUser = {
  id: string;
  email: string;
  isAdmin: boolean;
  isActive: boolean;
  dailyAgentMessageLimit: number;
  createdAt: string;
  todayUsage: {
    count: number;
    inputTokens: number;
    outputTokens: number;
  };
};

type Props = {
  initialUsers: AdminUser[];
  currentAdminId: string;
};

function formatTokens(tokens: number): string {
  if (tokens === 0) return "0";
  if (tokens < 1000) return String(tokens);
  return `${(tokens / 1000).toFixed(1)}k`;
}

export function AdminUsersTable({ initialUsers, currentAdminId }: Props) {
  const t = useT();
  const tx = useTx();
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patchUser(
    id: string,
    body: { isActive?: boolean; dailyAgentMessageLimit?: number },
  ): Promise<boolean> {
    setError(null);
    setPendingId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? t.admin.error);
        return false;
      }
      const data = (await res.json()) as {
        user: Pick<
          AdminUser,
          "id" | "email" | "isAdmin" | "isActive" | "dailyAgentMessageLimit"
        >;
      };
      setUsers((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
                ...u,
                isActive: data.user.isActive,
                dailyAgentMessageLimit: data.user.dailyAgentMessageLimit,
              }
            : u,
        ),
      );
      return true;
    } finally {
      setPendingId(null);
    }
  }

  async function onToggleActive(user: AdminUser, next: boolean) {
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, isActive: next } : u)),
    );
    const ok = await patchUser(user.id, { isActive: next });
    if (!ok) {
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isActive: user.isActive } : u)),
      );
    }
  }

  async function onCommitLimit(user: AdminUser, raw: string) {
    const next = Number.parseInt(raw, 10);
    if (!Number.isFinite(next) || next < 1 || next > 1000) {
      setError(tx({ es: "El límite debe estar entre 1 y 1000.", en: "The limit must be between 1 and 1000." }));
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, dailyAgentMessageLimit: user.dailyAgentMessageLimit }
            : u,
        ),
      );
      return;
    }
    if (next === user.dailyAgentMessageLimit) return;
    await patchUser(user.id, { dailyAgentMessageLimit: next });
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.admin.columnsEmail}</TableHead>
            <TableHead>{tx({ es: "Estado", en: "Status" })}</TableHead>
            <TableHead>{t.admin.columnsToday}</TableHead>
            <TableHead className="w-32">{t.admin.columnsLimit}</TableHead>
            <TableHead>{t.admin.columnsCreated}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => {
            const isSelf = u.id === currentAdminId;
            const totalTokens = u.todayUsage.inputTokens + u.todayUsage.outputTokens;
            return (
              <TableRow key={u.id}>
                <TableCell className="max-w-[20rem] truncate">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{u.email}</span>
                    <div className="flex items-center gap-1.5">
                      {u.isAdmin ? (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          admin
                        </Badge>
                      ) : null}
                      {isSelf ? (
                        <span className="text-muted-foreground text-[10px]">
                          {tx({ es: "(vos)", en: "(you)" })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={u.isActive}
                      onCheckedChange={(next: boolean) => onToggleActive(u, next)}
                      disabled={isSelf || pendingId === u.id}
                      aria-label={
                        u.isActive
                          ? tx({ es: "Desactivar usuario", en: "Deactivate user" })
                          : tx({ es: "Activar usuario", en: "Activate user" })
                      }
                    />
                    <span className="text-muted-foreground text-xs">
                      {u.isActive
                        ? tx({ es: "activo", en: "active" })
                        : tx({ es: "desactivado", en: "inactive" })}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  <span className="font-mono">
                    {u.todayUsage.count}/{u.dailyAgentMessageLimit}
                  </span>
                  {totalTokens > 0 ? (
                    <span className="text-muted-foreground/70 ml-2 text-xs">
                      · ~{formatTokens(totalTokens)} tokens
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    defaultValue={u.dailyAgentMessageLimit}
                    onBlur={(e) => onCommitLimit(u, e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                      }
                    }}
                    disabled={pendingId === u.id}
                    className="w-24"
                  />
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {format(new Date(u.createdAt), "yyyy-MM-dd")}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
