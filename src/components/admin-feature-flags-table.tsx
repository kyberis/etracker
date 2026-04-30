"use client";

import { useState } from "react";

import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTx } from "@/lib/i18n/client";

export type AdminFeatureFlag = {
  key: string;
  description: string;
  enabled: boolean;
  defaultEnabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

type Props = {
  initialFlags: AdminFeatureFlag[];
};

export function AdminFeatureFlagsTable({ initialFlags }: Props) {
  const tx = useTx();
  const [flags, setFlags] = useState<AdminFeatureFlag[]>(initialFlags);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onToggle(flag: AdminFeatureFlag, next: boolean) {
    setError(null);
    setPendingKey(flag.key);
    setFlags((prev) =>
      prev.map((f) => (f.key === flag.key ? { ...f, enabled: next } : f)),
    );
    try {
      const res = await fetch(`/api/admin/feature-flags/${flag.key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          data.error ??
            tx({
              es: "No pude guardar el cambio.",
              en: "Could not save the change.",
            }),
        );
        setFlags((prev) =>
          prev.map((f) =>
            f.key === flag.key ? { ...f, enabled: flag.enabled } : f,
          ),
        );
      }
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{tx({ es: "Flag", en: "Flag" })}</TableHead>
            <TableHead>{tx({ es: "Descripción", en: "Description" })}</TableHead>
            <TableHead className="w-32">
              {tx({ es: "Estado", en: "State" })}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {flags.map((flag) => (
            <TableRow key={flag.key}>
              <TableCell className="font-mono text-xs">{flag.key}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {flag.description}
                <div className="text-muted-foreground/70 mt-1 text-xs">
                  {tx({
                    es: `Default: ${flag.defaultEnabled ? "ON" : "OFF"}`,
                    en: `Default: ${flag.defaultEnabled ? "ON" : "OFF"}`,
                  })}
                  {flag.updatedAt
                    ? tx({
                        es: ` · Última edición: ${new Date(
                          flag.updatedAt,
                        ).toLocaleString()}`,
                        en: ` · Last edit: ${new Date(
                          flag.updatedAt,
                        ).toLocaleString()}`,
                      })
                    : ""}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={flag.enabled}
                    onCheckedChange={(next: boolean) => onToggle(flag, next)}
                    disabled={pendingKey === flag.key}
                    aria-label={
                      flag.enabled
                        ? tx({ es: "Desactivar flag", en: "Disable flag" })
                        : tx({ es: "Activar flag", en: "Enable flag" })
                    }
                  />
                  <span className="text-muted-foreground text-xs">
                    {flag.enabled
                      ? tx({ es: "activa", en: "on" })
                      : tx({ es: "inactiva", en: "off" })}
                  </span>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
