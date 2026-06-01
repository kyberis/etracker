"use client";

import { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MonthIncomeLinePayload } from "@/lib/month-page-types";
import { useT, useTx } from "@/lib/i18n/client";
import { incomeCategoryOptions } from "@/lib/validators";

type Bank = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: MonthIncomeLinePayload | null;
  banks: Bank[];
  saving: boolean;
  error: string | null;
  name: string;
  amount: string;
  bankId: string;
  category: string;
  occurredOn: string;
  received: boolean;
  onChangeName: (v: string) => void;
  onChangeAmount: (v: string) => void;
  onChangeBankId: (v: string) => void;
  onChangeCategory: (v: string) => void;
  onChangeOccurredOn: (v: string) => void;
  onChangeReceived: (v: boolean) => void;
  onSubmit: (e: FormEvent) => void | Promise<void>;
};

export function MonthIncomeEditDialog({
  open,
  onOpenChange,
  line,
  banks,
  saving,
  error,
  name,
  amount,
  bankId,
  category,
  occurredOn,
  received,
  onChangeName,
  onChangeAmount,
  onChangeBankId,
  onChangeCategory,
  onChangeOccurredOn,
  onChangeReceived,
  onSubmit,
}: Props) {
  const t = useT();
  const tx = useTx();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.month.editIncomeDialogTitle}</DialogTitle>
        </DialogHeader>
        {line ? (
          <form className="space-y-3" onSubmit={onSubmit}>
            <div className="space-y-1">
              <Label htmlFor="edit-income-name">{t.common.name}</Label>
              <Input
                id="edit-income-name"
                value={name}
                onChange={(e) => onChangeName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-income-amount">{t.common.amount}</Label>
              <Input
                id="edit-income-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => onChangeAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-income-date">{t.month.transactionDateLabel}</Label>
              <Input
                id="edit-income-date"
                type="date"
                value={occurredOn}
                onChange={(e) => onChangeOccurredOn(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>{t.common.bank}</Label>
              <Select
                value={bankId || "__none__"}
                onValueChange={(v) => onChangeBankId(v === "__none__" ? "" : (v ?? ""))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {bankId
                      ? (banks.find((b) => b.id === bankId)?.name ?? t.common.bank)
                      : tx({ es: "Sin banco", en: "No bank" })}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {tx({ es: "Sin banco", en: "No bank" })}
                  </SelectItem>
                  {banks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t.common.category}</Label>
              <Select value={category} onValueChange={(v) => onChangeCategory(v ?? "OTROS")}>
                <SelectTrigger className="w-full">
                  <SelectValue>{category.toLowerCase()}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {incomeCategoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={received}
                onCheckedChange={(c) => onChangeReceived(c === true)}
              />
              {received
                ? tx({ es: "Recibido", en: "Received" })
                : tx({ es: "Previsto", en: "Expected" })}
            </label>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving
                  ? tx({ es: "Guardando…", en: "Saving…" })
                  : tx({ es: "Guardar", en: "Save" })}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
