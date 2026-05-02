"use client";

import { format } from "date-fns";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/i18n/client";

export type AdminPendingPurgeUser = {
  id: string;
  email: string;
  deletedAt: string;
  scheduledFor: string;
  daysRemaining: number;
  remindersSent: { tMinus7: boolean; tMinus1: boolean };
};

type Props = {
  initialUsers: AdminPendingPurgeUser[];
  graceDays: number;
};

export function AdminPendingPurgeTable({ initialUsers, graceDays }: Props) {
  const t = useT();
  const [users, setUsers] = useState<AdminPendingPurgeUser[]>(initialUsers);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onPurgeNow(user: AdminPendingPurgeUser) {
    setError(null);
    setSuccess(null);
    if (!window.confirm(t.admin.pendingPurgeForceConfirm(user.email))) {
      return;
    }
    setPendingId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/purge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? t.admin.pendingPurgeForceError);
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setSuccess(t.admin.pendingPurgeForceSuccess);
    } finally {
      setPendingId(null);
    }
  }

  function reminderLabel(sent: AdminPendingPurgeUser["remindersSent"]): string {
    const parts: string[] = [];
    if (sent.tMinus7) parts.push("T-7");
    if (sent.tMinus1) parts.push("T-1");
    return parts.length === 0 ? t.admin.pendingPurgeRemindersNone : parts.join(", ");
  }

  if (users.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">{t.admin.pendingPurgeEmpty}</p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {success ? (
        <p className="text-emerald-600 dark:text-emerald-400 text-sm">{success}</p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.admin.pendingPurgeColumnsEmail}</TableHead>
            <TableHead>{t.admin.pendingPurgeColumnsDeletedAt}</TableHead>
            <TableHead>{t.admin.pendingPurgeColumnsScheduledFor}</TableHead>
            <TableHead>{t.admin.pendingPurgeColumnsRemaining}</TableHead>
            <TableHead>{t.admin.pendingPurgeColumnsReminders}</TableHead>
            <TableHead className="w-32" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => {
            const urgent = u.daysRemaining <= 1;
            return (
              <TableRow key={u.id}>
                <TableCell className="max-w-[20rem] truncate font-medium">
                  {u.email}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {format(new Date(u.deletedAt), "yyyy-MM-dd HH:mm")}
                </TableCell>
                <TableCell className="text-xs">
                  {format(new Date(u.scheduledFor), "yyyy-MM-dd")}
                </TableCell>
                <TableCell>
                  <span
                    className={`font-mono text-xs ${urgent ? "text-destructive font-semibold" : ""}`}
                  >
                    {u.daysRemaining} / {graceDays}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {reminderLabel(u.remindersSent)}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={pendingId === u.id}
                    onClick={() => onPurgeNow(u)}
                  >
                    {pendingId === u.id
                      ? t.admin.pendingPurgeForcing
                      : t.admin.pendingPurgeForceLabel}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
