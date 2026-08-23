import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Dict } from "@/lib/i18n/dictionaries/es";

export type AdminConnectionRow = {
  id: string;
  email: string;
  institutionName: string;
  institutionCountry: string;
  status: string;
  validUntil: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  accountCount: number;
};

export function OpenBankingConnectionsTable({
  rows,
  t,
}: {
  rows: AdminConnectionRow[];
  t: Dict["admin"]["openBanking"];
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{t.emptyConnections}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.colEmail}</TableHead>
          <TableHead>{t.colBank}</TableHead>
          <TableHead>{t.colStatus}</TableHead>
          <TableHead>{t.colValidUntil}</TableHead>
          <TableHead>{t.colLastSync}</TableHead>
          <TableHead>{t.colAccounts}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.email}</TableCell>
            <TableCell>
              {row.institutionName} ({row.institutionCountry})
            </TableCell>
            <TableCell>{row.status}</TableCell>
            <TableCell>{row.validUntil?.slice(0, 10) ?? "—"}</TableCell>
            <TableCell>{row.lastSyncAt?.slice(0, 16).replace("T", " ") ?? "—"}</TableCell>
            <TableCell>{row.accountCount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
