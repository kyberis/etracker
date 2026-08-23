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

export type AdminApiLogRow = {
  id: string;
  userId: string;
  action: string;
  status: string;
  httpStatus: number | null;
  requestSummary: unknown;
  responseSummary: unknown;
  errorMessage: string | null;
  durationMs: number;
  createdAt: string;
  user: { email: string };
};

export function OpenBankingApiLogsTable({
  rows,
  t,
}: {
  rows: AdminApiLogRow[];
  t: Dict["admin"]["openBanking"];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{t.emptyLogs}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.colTime}</TableHead>
          <TableHead>{t.colEmail}</TableHead>
          <TableHead>{t.colAction}</TableHead>
          <TableHead>{t.colStatus}</TableHead>
          <TableHead>{t.colDuration}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <Fragment key={row.id}>
            <TableRow
              className="cursor-pointer"
              onClick={() => setOpenId(openId === row.id ? null : row.id)}
            >
              <TableCell>{row.createdAt.slice(0, 19).replace("T", " ")}</TableCell>
              <TableCell>{row.user.email}</TableCell>
              <TableCell>{row.action}</TableCell>
              <TableCell>
                {row.status}
                {row.httpStatus ? ` ${row.httpStatus}` : ""}
              </TableCell>
              <TableCell>{row.durationMs}ms</TableCell>
            </TableRow>
            {openId === row.id ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <pre className="text-xs overflow-auto max-h-64">
                    {JSON.stringify(
                      {
                        request: row.requestSummary,
                        response: row.responseSummary,
                        error: row.errorMessage,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </TableCell>
              </TableRow>
            ) : null}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
