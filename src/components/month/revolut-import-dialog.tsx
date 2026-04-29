"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";
import { useLocale, useT, useTx } from "@/lib/i18n/client";
import type { ImportableTransaction } from "@/lib/revolut/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importable: ImportableTransaction[];
  defaultImportBankId: string | null | undefined;
  rowBusyId: string | null;
  onImport: (tx: ImportableTransaction) => void | Promise<void>;
  onIgnore: (ids: string[]) => void | Promise<void>;
};

export function RevolutImportDialog({
  open,
  onOpenChange,
  importable,
  defaultImportBankId,
  rowBusyId,
  onImport,
  onIgnore,
}: Props) {
  const t = useT();
  const tr = useTx();
  const locale = useLocale();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-lg"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>{t.month.importFromRevolut}</DialogTitle>
          <DialogDescription>
            {tr({
              es: "Movimientos del mes sin coincidencia con tus gastos planificados. Si definiste instrucciones en Ajustes, el asistente puede haber filtrado transferencias u otros movimientos y sugerir categoría. Importá como gasto del mes o ignorá para no volver a verlos al sincronizar.",
              en: "Month transactions that do not match your planned expenses. If you set instructions in Settings, the assistant may have filtered transfers or other movements and suggested a category. Import as a month expense or ignore so they do not reappear when syncing.",
            })}
          </DialogDescription>
        </DialogHeader>
        {importable.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {tr({ es: "No quedan movimientos pendientes.", en: "No pending transactions left." })}
          </p>
        ) : (
          <ul className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
            {importable.map((tx) => (
              <li
                key={tx.transactionId}
                className="space-y-2 rounded-md border p-3 text-sm"
              >
                <p className="font-medium leading-snug">{tx.description}</p>
                <p className="text-muted-foreground text-xs">
                  {tx.bookingDate ? `${tx.bookingDate} · ` : null}
                  <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
                    {formatCurrency(
                      Math.abs(Number(tx.amount)),
                      tx.currency && tx.currency.length === 3 ? tx.currency : "USD",
                      locale,
                    )}
                  </span>
                  {tx.currency ? ` ${tx.currency}` : null}
                </p>
                {tx.suggestedCategory ? (
                  <p className="text-muted-foreground text-xs">
                    {tr({
                      es: "Categoría sugerida:",
                      en: "Suggested category:",
                    })}{" "}
                    <span className="text-foreground font-medium">{tx.suggestedCategory}</span>
                    {tx.assistantNote ? ` — ${tx.assistantNote}` : null}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!defaultImportBankId || rowBusyId === tx.transactionId}
                    onClick={() => void onImport(tx)}
                  >
                    {rowBusyId === tx.transactionId ? t.month.importing : tr({ es: "Importar", en: "Import" })}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={rowBusyId === tx.transactionId}
                    onClick={() => void onIgnore([tx.transactionId])}
                  >
                    {tr({ es: "Ignorar", en: "Ignore" })}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {importable.length > 0 ? (
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => void onIgnore(importable.map((row) => row.transactionId))}
            >
              {tr({ es: "Ignorar todas las restantes", en: "Ignore all remaining" })}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t.common.close}
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t.common.close}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
