"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type Bank = {
  id: string;
  name: string;
  color: string | null;
};

type BanksManagerProps = {
  initialBanks: Bank[];
};

/**
 * Curated palette of swatches users can pick from when tagging a bank.
 * Hex values are stored verbatim (with the leading `#`) on the API side,
 * so the same comparison works for create + edit highlighting.
 */
const BANK_COLOR_PALETTE = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#22c55e", // green
  "#14b8a6", // teal
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#64748b", // slate
] as const;

function normalizeHex(value: string | null | undefined): string {
  if (!value) return "";
  return value.startsWith("#") ? value.toLowerCase() : `#${value.toLowerCase()}`;
}

type ColorPaletteProps = {
  value: string;
  onChange: (color: string) => void;
  noColorLabel: string;
};

function ColorPalette({ value, onChange, noColorLabel }: ColorPaletteProps) {
  const selected = normalizeHex(value);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange("")}
        aria-pressed={selected === ""}
        aria-label={noColorLabel}
        title={noColorLabel}
        className={cn(
          "relative h-8 w-8 rounded-full border-2 transition-all",
          "bg-background flex items-center justify-center",
          selected === ""
            ? "border-foreground scale-110"
            : "border-border hover:border-foreground/60",
        )}
      >
        <span className="bg-muted-foreground/60 absolute h-[2px] w-5 -rotate-45 rounded-full" />
      </button>
      {BANK_COLOR_PALETTE.map((swatch) => {
        const isSelected = selected === swatch;
        return (
          <button
            key={swatch}
            type="button"
            onClick={() => onChange(swatch)}
            aria-pressed={isSelected}
            aria-label={swatch}
            title={swatch}
            className={cn(
              "h-8 w-8 rounded-full border-2 transition-all",
              isSelected
                ? "border-foreground scale-110 shadow-md"
                : "border-transparent hover:scale-105",
            )}
            style={{ backgroundColor: swatch }}
          />
        );
      })}
    </div>
  );
}

export function BanksManager({ initialBanks }: BanksManagerProps) {
  const t = useT();
  const [banks, setBanks] = useState<Bank[]>(initialBanks);
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Bank | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  async function loadBanks() {
    const response = await fetch("/api/banks");
    const data = (await response.json()) as { banks: Bank[] };
    setBanks(data.banks ?? []);
  }

  async function createBank(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/banks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? t.banks.saveError);
      return;
    }

    setName("");
    setColor("");
    await loadBanks();
  }

  function openEdit(bank: Bank) {
    setEditing(bank);
    setEditName(bank.name);
    setEditColor(bank.color ?? "");
    setEditError(null);
  }

  function closeEdit() {
    setEditing(null);
    setEditError(null);
    setEditSaving(false);
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setEditError(null);
    setEditSaving(true);

    const response = await fetch(`/api/banks/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), color: editColor }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setEditError(data.error ?? t.banks.saveError);
      setEditSaving(false);
      return;
    }

    await loadBanks();
    closeEdit();
  }

  async function removeBank(bank: Bank) {
    const confirmed = window.confirm(t.banks.deleteConfirm(bank.name));
    if (!confirmed) return;

    const response = await fetch(`/api/banks/${bank.id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? t.banks.deleteError);
      return;
    }
    await loadBanks();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t.banks.addBank}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={createBank}>
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <Input
                placeholder={t.banks.namePlaceholder}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
              <Button type="submit" className="md:w-auto">
                {t.banks.save}
              </Button>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">
                {t.banks.colorLabel}
              </Label>
              <ColorPalette
                value={color}
                onChange={setColor}
                noColorLabel={t.banks.colorNone}
              />
              <p className="text-muted-foreground text-xs">{t.banks.colorHint}</p>
            </div>
          </form>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.banks.pageTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {banks.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t.banks.empty}</p>
          ) : (
            banks.map((bank) => (
              <div
                key={bank.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex items-center gap-2">
                  {bank.color ? (
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: bank.color }}
                    />
                  ) : null}
                  <span>{bank.name}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(bank)}>
                    {t.banks.edit}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => removeBank(bank)}
                  >
                    {t.banks.delete}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) closeEdit();
        }}
      >
        <DialogContent>
          <form onSubmit={saveEdit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t.banks.editTitle}</DialogTitle>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="bank-edit-name">{t.banks.nameLabel}</Label>
              <Input
                id="bank-edit-name"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">
                {t.banks.colorLabel}
              </Label>
              <ColorPalette
                value={editColor}
                onChange={setEditColor}
                noColorLabel={t.banks.colorNone}
              />
              <p className="text-muted-foreground text-xs">{t.banks.colorHint}</p>
            </div>

            {editError ? (
              <p className="text-sm text-red-600">{editError}</p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeEdit}
                disabled={editSaving}
              >
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={editSaving || !editName.trim()}>
                {editSaving ? t.banks.saving : t.banks.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
