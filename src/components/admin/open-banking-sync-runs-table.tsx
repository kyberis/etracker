"use client";

import { Fragment, useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Dict } from "@/lib/i18n/dictionaries/es";

export type AdminSyncRunRow = {
  id: string;
  trigger: string;
  status: string;
  transactionsFound: number;
  transactionsImported: number;
  transactionsSkipped: number;
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number;
  startedAt: string;
  connection: {
    institutionName: string;
    user: { email: string };
  };
};

export function OpenBankingSyncRunsTable({
  rows,
  t,
}: {
  rows: AdminSyncRunRow[];
  t: Dict["admin"]["openBanking"];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{t.emptyRuns}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.colTime}</TableHead>
          <TableHead>{t.colEmail}</TableHead>
          <TableHead>{t.colBank}</TableHead>
          <TableHead>{t.colTrigger}</TableHead>
          <TableHead>{t.colStatus}</TableHead>
          <TableHead>{t.colImported}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <Fragment key={row.id}>
            <TableRow
              className="cursor-pointer"
              onClick={() => setOpenId(openId === row.id ? null : row.id)}
            >
              <TableCell>{row.startedAt.slice(0, 19).replace("T", " ")}</TableCell>
              <TableCell>{row.connection.user.email}</TableCell>
              <TableCell>{row.connection.institutionName}</TableCell>
              <TableCell>{row.trigger}</TableCell>
              <TableCell>{row.status}</TableCell>
              <TableCell>
                {row.transactionsImported}/{row.transactionsFound}
              </TableCell>
            </TableRow>
            {openId === row.id ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground text-xs">
                  skipped {row.transactionsSkipped} · {row.durationMs}ms
                  {row.errorCode ? ` · ${row.errorCode}` : ""}
                  {row.errorMessage ? ` · ${row.errorMessage}` : ""}
                </TableCell>
              </TableRow>
            ) : null}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
