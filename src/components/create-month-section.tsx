"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT, useTx } from "@/lib/i18n/client";

type CreateMonthSectionProps = {
  month: string;
  /** yyyy-MM to suggest when copying, or null if none */
  suggestedCopyFrom: string | null;
};

export function CreateMonthSection({ month, suggestedCopyFrom }: CreateMonthSectionProps) {
  const router = useRouter();
  const t = useT();
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"templates" | "copyFrom">(suggestedCopyFrom ? "copyFrom" : "templates");
  const [copyFromMonth, setCopyFromMonth] = useState(suggestedCopyFrom ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createMonth() {
    setError(null);
    if (mode === "copyFrom" && !/^\d{4}-\d{2}$/.test(copyFromMonth)) {
      setError(tx({ es: "Indicá un mes de origen válido (aaaa-mm).", en: "Enter a valid source month (yyyy-mm)." }));
      return;
    }
    setSaving(true);
    const body =
      mode === "templates"
        ? { month, mode: "templates" as const }
        : { month, mode: "copyFrom" as const, copyFromMonth: copyFromMonth.trim() };
    const res = await fetch("/api/months", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const p = (await res.json()) as { error?: string };
      setError(p.error ?? tx({ es: "No se pudo crear el mes.", en: "Could not create the month." }));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="bg-muted/40 rounded-lg border p-6 text-center">
      <p className="text-muted-foreground mb-4 text-sm">{t.month.notCreated}</p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button />}>{tx({ es: "Configurar mes", en: "Set up month" })}</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {tx({ es: "Nuevo mes:", en: "New month:" })} {month}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-left">
            <p className="text-muted-foreground text-sm">
              {tx({ es: "¿Cómo querés rellenarlo?", en: "How should we fill it?" })}
            </p>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "templates"}
                  onChange={() => setMode("templates")}
                />
                {t.month.createFromTemplates}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "copyFrom"}
                  onChange={() => setMode("copyFrom")}
                />
                {tx({ es: "Duplicar desde otro mes", en: "Duplicate from another month" })}
              </label>
            </div>
            {mode === "copyFrom" ? (
              <div className="space-y-1.5">
                <Label htmlFor="copyFrom">
                  {tx({ es: "Mes de origen (aaaa-mm)", en: "Source month (yyyy-mm)" })}
                </Label>
                <Input
                  id="copyFrom"
                  type="month"
                  value={copyFromMonth}
                  onChange={(e) => setCopyFromMonth(e.target.value)}
                />
                {suggestedCopyFrom && suggestedCopyFrom !== copyFromMonth ? (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-xs"
                    onClick={() => setCopyFromMonth(suggestedCopyFrom)}
                  >
                    {tx({ es: `Usar ${suggestedCopyFrom}`, en: `Use ${suggestedCopyFrom}` })}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t.common.cancel}
              </Button>
              <Button type="button" onClick={() => void createMonth()} disabled={saving}>
                {saving ? t.month.creating : t.month.createBtn}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
