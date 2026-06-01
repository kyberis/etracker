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
import type { MonthLinePayload } from "@/lib/month-page-types";
import { useT, useTx } from "@/lib/i18n/client";
import { expenseCategoryOptions } from "@/lib/validators";

type Bank = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: MonthLinePayload | null;
  banks: Bank[];
  saving: boolean;
  error: string | null;
  name: string;
  amount: string;
  bankId: string;
  category: string;
  occurredOn: string;
  paid: boolean;
  onChangeName: (v: string) => void;
  onChangeAmount: (v: string) => void;
  onChangeBankId: (v: string) => void;
  onChangeCategory: (v: string) => void;
  onChangeOccurredOn: (v: string) => void;
  onChangePaid: (v: boolean) => void;
  onSubmit: (e: FormEvent) => void | Promise<void>;
};

export function MonthLineEditDialog({
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
  paid,
  onChangeName,
  onChangeAmount,
  onChangeBankId,
  onChangeCategory,
  onChangeOccurredOn,
  onChangePaid,
  onSubmit,
}: Props) {
  const t = useT();
  const tx = useTx();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.month.editLineDialogTitle}</DialogTitle>
        </DialogHeader>
        {line ? (
          <form className="space-y-3" onSubmit={onSubmit}>
            <div className="space-y-1">
              <Label htmlFor="edit-line-name">{t.common.name}</Label>
              <Input
                id="edit-line-name"
                value={name}
                onChange={(e) => onChangeName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-line-amount">{t.common.amount}</Label>
              <Input
                id="edit-line-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => onChangeAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-line-date">{t.month.transactionDateLabel}</Label>
              <Input
                id="edit-line-date"
                type="date"
                value={occurredOn}
                onChange={(e) => onChangeOccurredOn(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>{t.common.bank}</Label>
              <Select value={bankId} onValueChange={(v) => onChangeBankId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {banks.find((b) => b.id === bankId)?.name ?? t.common.bank}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
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
                  {expenseCategoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={paid} onCheckedChange={(c) => onChangePaid(c === true)} />
              {paid ? t.month.paid : t.month.unpaid}
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
