import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Dict } from "@/lib/i18n/dictionaries/es";

type Stats = Awaited<
  ReturnType<typeof import("@/lib/db/open-banking-admin").getOpenBankingStats>
>;

export function OpenBankingStats({
  stats,
  t,
}: {
  stats: Stats;
  t: Dict["admin"]["openBanking"];
}) {
  const cards = [
    { label: t.statActive, value: stats.connections.active },
    { label: t.statReauth, value: stats.connections.needsReauth },
    { label: t.statError, value: stats.connections.error },
    { label: t.statSyncOk, value: stats.syncs24h.success },
    { label: t.statSyncErr, value: stats.syncs24h.error },
    { label: t.statImported, value: stats.imported7d },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl">{card.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      {stats.topAspsps.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.topAspsps}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {stats.topAspsps.map((row) => (
                <li key={row.name}>
                  {row.name} · {row.count}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      {stats.expiringSoon.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.expiringSoon}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {stats.expiringSoon.map((row) => (
                <li key={row.id}>
                  {row.email} · {row.institutionName} · {row.validUntil?.slice(0, 10)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
