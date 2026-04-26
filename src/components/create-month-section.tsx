"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CreateMonthSectionProps = {
  month: string;
  /** yyyy-MM to suggest when copying, or null if none */
  suggestedCopyFrom: string | null;
};

export function CreateMonthSection({ month, suggestedCopyFrom }: CreateMonthSectionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"templates" | "copyFrom">(suggestedCopyFrom ? "copyFrom" : "templates");
  const [copyFromMonth, setCopyFromMonth] = useState(suggestedCopyFrom ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createMonth() {
    setError(null);
    if (mode === "copyFrom" && !/^\d{4}-\d{2}$/.test(copyFromMonth)) {
      setError("Indicá un mes de origen válido (aaaa-mm).");
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
      setError(p.error ?? "No se pudo crear el mes.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="bg-muted/40 rounded-lg border p-6 text-center">
      <p className="text-muted-foreground mb-4 text-sm">Este mes aún no fue configurado.</p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button />}>Configurar mes</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo mes: {month}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-left">
            <p className="text-muted-foreground text-sm">¿Cómo querés rellenarlo?</p>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "templates"}
                  onChange={() => setMode("templates")}
                />
                Desde definiciones (plantillas vigentes)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "copyFrom"}
                  onChange={() => setMode("copyFrom")}
                />
                Duplicar desde otro mes
              </label>
            </div>
            {mode === "copyFrom" ? (
              <div className="space-y-1.5">
                <Label htmlFor="copyFrom">Mes de origen (aaaa-mm)</Label>
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
                    Usar {suggestedCopyFrom}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void createMonth()} disabled={saving}>
                {saving ? "Guardando…" : "Crear mes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
