"use client";

import { Chat, useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Check, ChevronDown, Send, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { MonthExcelCharts } from "@/components/month/month-excel-charts";
import { Button } from "@/components/ui/button";
import type { CellAskContext, CellAskFocus } from "@/lib/ai/cell-ask-context";
import { formatCurrency } from "@/lib/format";
import { useLocale, useT, useTx } from "@/lib/i18n/client";
import {
  activeBankCount,
  topExpenses,
  totalsByBank,
  totalsByCategory,
  totalsByKind,
  withEffectiveAmounts,
} from "@/lib/month-aggregates";
import {
  applyDeliveryPreset,
  effectiveAmountConverted,
  getSimLine,
  resetSimState,
  simHasChanges,
  simStorageKey,
  type SimStateMap,
} from "@/lib/month-sim";
import type { MonthLinePayload } from "@/lib/month-page-types";
import { cn } from "@/lib/utils";
import { expenseCategoryOptions } from "@/lib/validators";

type BankTotal = {
  bankId: string;
  bankName: string;
  color?: string | null;
  planned: number;
  paid: number;
};

type Props = {
  month: string;
  primaryCurrency: string;
  expenses: MonthLinePayload[];
  bankTotals: BankTotal[];
  onExpensesChange: (next: MonthLinePayload[]) => void;
  onRefresh: () => void;
};

type GridMode = "table" | "charts" | "sim";
type Filter = "all" | "recurring" | "oneoff";

type AskCtx = {
  focus: CellAskFocus;
  label: string;
  line?: MonthLinePayload;
};

const CAT_LABEL_ES: Record<string, string> = {
  VIVIENDA: "Vivienda",
  SERVICIOS: "Servicios",
  TRANSPORTE: "Transporte",
  ALIMENTACION: "Alimentación",
  SALUD: "Salud",
  EDUCACION: "Educación",
  ENTRETENIMIENTO: "Entretenimiento",
  SUSCRIPCIONES: "Suscripciones",
  DEUDAS: "Deudas",
  IMPUESTOS: "Impuestos",
  AHORRO: "Ahorro",
  REGALOS: "Regalos",
  CRYPTO: "Crypto",
  STOCK: "Stock",
  OTROS: "Otros",
};

const CAT_LABEL_EN: Record<string, string> = {
  VIVIENDA: "Housing",
  SERVICIOS: "Utilities",
  TRANSPORTE: "Transport",
  ALIMENTACION: "Food",
  SALUD: "Health",
  EDUCACION: "Education",
  ENTRETENIMIENTO: "Entertainment",
  SUSCRIPCIONES: "Subscriptions",
  DEUDAS: "Debt",
  IMPUESTOS: "Taxes",
  AHORRO: "Savings",
  REGALOS: "Gifts",
  CRYPTO: "Crypto",
  STOCK: "Stocks",
  OTROS: "Other",
};

export function MonthExcelGrid({
  month,
  primaryCurrency,
  expenses,
  bankTotals,
  onExpensesChange,
  onRefresh,
}: Props) {
  const t = useT();
  const tx = useTx();
  const locale = useLocale();
  const fmt = useCallback(
    (n: number) => formatCurrency(n, primaryCurrency, locale),
    [primaryCurrency, locale],
  );
  const catLabel = useCallback(
    (c: string) => (locale === "en" ? CAT_LABEL_EN[c] : CAT_LABEL_ES[c]) ?? c,
    [locale],
  );

  const [mode, setMode] = useState<GridMode>("table");
  const [filter, setFilter] = useState<Filter>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [sim, setSim] = useState<SimStateMap>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = sessionStorage.getItem(simStorageKey("local", month));
      if (raw) return JSON.parse(raw) as SimStateMap;
    } catch {
      /* ignore */
    }
    return {};
  });
  const [toast, setToast] = useState<string | null>(null);
  const [askCtx, setAskCtx] = useState<AskCtx | null>(null);
  const [floatOpen, setFloatOpen] = useState(false);
  const [floatPos, setFloatPos] = useState({ left: 0, top: 0 });
  const [floatText, setFloatText] = useState("");
  const [editing, setEditing] = useState<{
    lineId: string;
    field: "name" | "category" | "amount";
  } | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatRef = useRef<{ cellAsk: CellAskContext | null }>({ cellAsk: null });
  const floatInputRef = useRef<HTMLTextAreaElement>(null);
  const skipBlurCommit = useRef(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(simStorageKey("local", month), JSON.stringify(sim));
    } catch {
      /* ignore */
    }
  }, [sim, month]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  /* eslint-disable react-hooks/refs -- prepareSendMessagesRequest runs on POST, not during render */
  const chat = useMemo(
    () =>
      new Chat({
        transport: new DefaultChatTransport({
          api: "/api/chat",
          prepareSendMessagesRequest: ({ messages, body }) => ({
            body: {
              ...(body ?? {}),
              messages,
              responseStyle: "concise",
              activeMonth: month,
              surface: "month-grid",
              cellAsk: chatRef.current.cellAsk,
            },
          }),
        }),
      }),
    [month],
  );
  /* eslint-enable react-hooks/refs */
  const { messages, sendMessage, setMessages, status } = useChat({ chat });
  const isStreaming = status === "submitted" || status === "streaming";

  const aggregateLines = useMemo(
    () =>
      expenses.map((e) => ({
        id: e.id,
        name: e.name,
        category: e.category,
        bankId: e.bankId,
        bankName: e.bankName,
        kind: e.kind,
        amountConverted: e.amountConverted,
      })),
    [expenses],
  );

  const effective = useMemo(
    () => withEffectiveAmounts(aggregateLines, sim),
    [aggregateLines, sim],
  );
  const kindTotals = useMemo(() => totalsByKind(effective), [effective]);
  const byCat = useMemo(() => totalsByCategory(effective), [effective]);
  const byBankAgg = useMemo(() => totalsByBank(effective), [effective]);
  const top = useMemo(() => topExpenses(effective, 8), [effective]);
  const banksActive = useMemo(() => activeBankCount(effective), [effective]);
  const baseline = useMemo(
    () => expenses.reduce((s, e) => s + Number(e.amountConverted), 0),
    [expenses],
  );
  const saved = baseline - kindTotals.total;
  const hasSim = simHasChanges(sim);

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (filter === "recurring") return e.kind === "RECURRING";
      if (filter === "oneoff") return e.kind === "ONE_OFF";
      return true;
    });
  }, [expenses, filter]);

  const bankOrder = bankTotals.map((b) => b.bankId);

  const visibleGrand = useMemo(() => {
    return filtered.reduce(
      (s, l) =>
        s +
        effectiveAmountConverted(Number(l.amountConverted), getSimLine(sim, l.id)),
      0,
    );
  }, [filtered, sim]);

  const tip = useMemo(() => {
    if (hasSim && saved > 0) return t.monthGrid.tipSim(fmt(saved));
    const pct = kindTotals.total
      ? Math.round((kindTotals.oneOff / kindTotals.total) * 100)
      : 0;
    if (pct >= 35) return t.monthGrid.tipOneOffHeavy(pct, fmt(kindTotals.oneOff));
    return t.monthGrid.tipAsk;
  }, [hasSim, saved, kindTotals, t, fmt]);

  function showToast(msg: string) {
    setToast(msg);
  }

  function buildCellAsk(ctx: AskCtx): CellAskContext {
    const lineSnap = ctx.line
      ? {
          id: ctx.line.id,
          name: ctx.line.name,
          kind: ctx.line.kind,
          category: ctx.line.category,
          bankId: ctx.line.bankId,
          bankName: ctx.line.bankName,
          amountConverted: Number(ctx.line.amountConverted),
          paid: ctx.line.paid,
          occurredOn: ctx.line.occurredOn,
        }
      : undefined;
    let bankTotal: CellAskContext["bankTotal"];
    const focus = ctx.focus;
    if (focus.type === "bank") {
      const b = byBankAgg.find((x) => x.bankId === focus.bankId);
      if (b) bankTotal = b;
    }
    return {
      month,
      primaryCurrency,
      focus: ctx.focus,
      label: ctx.label,
      line: lineSnap,
      monthTotals: {
        total: kindTotals.total,
        recurring: kindTotals.recurring,
        oneOff: kindTotals.oneOff,
      },
      bankTotal,
    };
  }

  function openAsk(ctx: AskCtx, clientX: number, clientY: number) {
    setAskCtx(ctx);
    const pad = 12;
    const w = Math.min(420, window.innerWidth - 24);
    let left = clientX - 24;
    let top = clientY + 14;
    if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
    if (left < pad) left = pad;
    if (top + 180 > window.innerHeight - pad) top = Math.max(pad, clientY - 190);
    setFloatPos({ left, top });
    setFloatText("");
    setFloatOpen(true);
    requestAnimationFrame(() => floatInputRef.current?.focus());
  }

  function closeFloat() {
    setFloatOpen(false);
  }

  async function submitAsk(text?: string) {
    const q = (text ?? floatText).trim();
    if (!q || !askCtx) return;
    const cellAsk = buildCellAsk(askCtx);
    chatRef.current.cellAsk = cellAsk;
    closeFloat();
    await sendMessage({ text: q });
  }

  async function patchLine(
    lineId: string,
    body: Record<string, unknown>,
    optimistic: (line: MonthLinePayload) => MonthLinePayload,
  ) {
    const prev = expenses;
    onExpensesChange(expenses.map((l) => (l.id === lineId ? optimistic(l) : l)));
    const res = await fetch(`/api/month-expense-lines/${lineId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      onExpensesChange(prev);
      showToast(t.monthGrid.editError);
      return;
    }
    showToast(t.monthGrid.editSaved);
    onRefresh();
  }

  function onCellClick(
    e: ReactMouseEvent,
    ctx: AskCtx,
    editable?: boolean,
  ) {
    if (editing) return;
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      return;
    }
    const { clientX, clientY } = e;
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      openAsk(ctx, clientX, clientY);
    }, editable ? 220 : 0);
  }

  function onCellDblClick(
    e: ReactMouseEvent,
    lineId: string,
    field: "name" | "category" | "amount" | "paid",
  ) {
    e.preventDefault();
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    closeFloat();
    if (field === "paid") {
      const line = expenses.find((l) => l.id === lineId);
      if (!line) return;
      void patchLine(lineId, { paid: !line.paid }, (l) => ({ ...l, paid: !l.paid }));
      return;
    }
    setEditing({ lineId, field });
  }

  function commitEdit(lineId: string, field: "name" | "category" | "amount", value: string) {
    setEditing(null);
    const line = expenses.find((l) => l.id === lineId);
    if (!line) return;
    if (field === "name") {
      const name = value.trim();
      if (!name || name === line.name) return;
      void patchLine(lineId, { name }, (l) => ({ ...l, name }));
    } else if (field === "category") {
      if (value === line.category) return;
      void patchLine(lineId, { category: value }, (l) => ({ ...l, category: value }));
    } else if (field === "amount") {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 0) return;
      const fx = Number(line.fxRate) || 1;
      const amountConverted = String(Math.round(amount * fx * 100) / 100);
      void patchLine(
        lineId,
        { amount },
        (l) => ({ ...l, amount: String(amount), amountConverted }),
      );
    }
  }

  const bankColor = (bankId: string) =>
    bankTotals.find((b) => b.bankId === bankId)?.color ?? "#7ec83a";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">{t.monthGrid.title}</h2>
          <p className="text-muted-foreground text-sm">{t.monthGrid.subtitle}</p>
        </div>
        <div className="bg-cream/80 inline-flex gap-0.5 rounded-full border border-[color:var(--border)] p-1">
          {(
            [
              ["table", t.monthGrid.modeTable],
              ["charts", t.monthGrid.modeCharts],
              ["sim", t.monthGrid.modeSim],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-semibold",
                mode === id
                  ? "bg-ink text-cream-soft"
                  : "text-muted-foreground hover:text-ink",
              )}
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            {
              key: "total" as const,
              label: t.monthGrid.kpiTotal,
              value: fmt(kindTotals.total),
              sub:
                saved > 0 ? (
                  <span className="text-good text-xs">{t.monthGrid.kpiVsReal(fmt(saved))}</span>
                ) : null,
            },
            {
              key: "recurring" as const,
              label: t.monthGrid.kpiRecurring,
              value: fmt(kindTotals.recurring),
              sub: (
                <span className="text-muted-foreground text-xs">
                  {t.monthGrid.kpiPctOfMonth(
                    kindTotals.total
                      ? Math.round((kindTotals.recurring / kindTotals.total) * 100)
                      : 0,
                  )}
                </span>
              ),
            },
            {
              key: "oneoff" as const,
              label: t.monthGrid.kpiOneOff,
              value: fmt(kindTotals.oneOff),
              sub: (
                <span className="text-muted-foreground text-xs">
                  {t.monthGrid.kpiPctOfMonth(
                    kindTotals.total
                      ? Math.round((kindTotals.oneOff / kindTotals.total) * 100)
                      : 0,
                  )}
                </span>
              ),
            },
            {
              key: "banks" as const,
              label: t.monthGrid.kpiBanks,
              value: String(banksActive),
              sub: (
                <span className="text-muted-foreground text-xs">
                  {t.monthGrid.kpiActiveLines(
                    expenses.filter((e) => getSimLine(sim, e.id).included).length,
                  )}
                </span>
              ),
            },
          ] as const
        ).map((kpi) => (
          <button
            key={kpi.key}
            type="button"
            className="rounded-2xl border border-[color:var(--border)] bg-white/70 p-4 text-left transition hover:border-lime-deep/50 hover:shadow-[0_0_0_3px_rgba(184,240,110,0.35)]"
            onClick={(e) =>
              openAsk(
                {
                  focus: { type: "kpi", kpi: kpi.key },
                  label: `${kpi.label} · ${kpi.value}`,
                },
                e.clientX,
                e.clientY,
              )
            }
          >
            <p className="text-muted-foreground text-[10px] font-bold tracking-[0.14em] uppercase">
              {kpi.label}
            </p>
            <p className="font-display mt-1 text-2xl font-semibold tabular-nums">{kpi.value}</p>
            {kpi.sub}
          </button>
        ))}
      </div>

      <div className="from-lime/35 to-lilac/25 flex items-start gap-3 rounded-2xl border border-[color:var(--border)] bg-gradient-to-r px-4 py-3">
        <span className="bg-ink text-cream-soft font-display flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold">
          C
        </span>
        <p className="pt-1 text-sm leading-relaxed">{tip}</p>
      </div>

      {mode === "charts" ? (
        <MonthExcelCharts
          byCategory={byCat}
          byBank={byBankAgg.map((b) => ({
            ...b,
            color: bankColor(b.bankId),
          }))}
          byKind={{ recurring: kindTotals.recurring, oneOff: kindTotals.oneOff }}
          top={top}
          primaryCurrency={primaryCurrency}
          categoryLabel={catLabel}
        />
      ) : null}

      {mode === "sim" ? (
        <div className="space-y-3">
          <div className="from-lilac/40 to-lime/30 flex flex-wrap items-center gap-6 rounded-2xl border border-[color:var(--border)] bg-gradient-to-r px-4 py-3">
            <div>
              <p className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                {t.monthGrid.simSavedLabel}
              </p>
              <p className="text-good font-display text-3xl font-bold tabular-nums">
                {fmt(Math.max(0, saved))}
              </p>
              <p className="text-muted-foreground text-xs">{t.monthGrid.simSavedHint}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                {t.monthGrid.simTotalLabel}
              </p>
              <p className="font-display text-2xl font-semibold tabular-nums">
                {fmt(kindTotals.total)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                {t.monthGrid.simBaselineLabel}
              </p>
              <p className="text-muted-foreground font-display text-2xl font-semibold tabular-nums">
                {fmt(baseline)}
              </p>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSim(resetSimState());
                  showToast(t.monthGrid.simResetToast);
                }}
              >
                {t.monthGrid.simReset}
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-lime/50"
                onClick={() => {
                  setSim((s) => applyDeliveryPreset(expenses, s));
                  showToast(t.monthGrid.simDeliveryToast);
                }}
              >
                {t.monthGrid.simNoDelivery}
              </Button>
            </div>
          </div>
          <p className="text-muted-foreground text-sm">{t.monthGrid.simIntro}</p>
          <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-[color:var(--border)] bg-white">
            <div className="text-muted-foreground bg-cream-soft/80 grid grid-cols-[28px_1fr_90px_120px_80px] gap-2 px-3 py-2 text-[10px] font-bold tracking-wide uppercase">
              <span />
              <span>{t.monthGrid.colName}</span>
              <span className="text-right">{t.monthGrid.simOriginal}</span>
              <span>{t.monthGrid.simCut}</span>
              <span className="text-right">{t.monthGrid.simEffective}</span>
            </div>
            {[...expenses]
              .sort((a, b) => Number(b.amountConverted) - Number(a.amountConverted))
              .map((line) => {
                const s = getSimLine(sim, line.id);
                const eff = effectiveAmountConverted(Number(line.amountConverted), s);
                return (
                  <div
                    key={line.id}
                    className={cn(
                      "grid grid-cols-[28px_1fr_90px_120px_80px] items-center gap-2 border-b border-[color:var(--border)]/60 px-3 py-2 text-sm",
                      !s.included && "opacity-45",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={s.included}
                      onChange={(e) =>
                        setSim((prev) => ({
                          ...prev,
                          [line.id]: {
                            included: e.target.checked,
                            cutPct: e.target.checked ? s.cutPct : 0,
                          },
                        }))
                      }
                      aria-label={line.name}
                    />
                    <div>
                      <div className="font-medium">{line.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {line.bankName} · {catLabel(line.category)} ·{" "}
                        {line.kind === "RECURRING"
                          ? t.monthGrid.kindRecurring
                          : t.monthGrid.kindOneOff}
                      </div>
                    </div>
                    <div className="text-muted-foreground text-right tabular-nums">
                      {fmt(Number(line.amountConverted))}
                    </div>
                    <div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={s.cutPct}
                        disabled={!s.included}
                        className="w-full accent-[var(--lime-deep)]"
                        aria-valuetext={`−${s.cutPct}% · ${fmt(eff)}`}
                        onChange={(e) =>
                          setSim((prev) => ({
                            ...prev,
                            [line.id]: {
                              included: true,
                              cutPct: Number(e.target.value),
                            },
                          }))
                        }
                      />
                      <div className="text-muted-foreground text-center text-[10px]">
                        −{s.cutPct}%
                      </div>
                    </div>
                    <div
                      className={cn(
                        "text-right tabular-nums",
                        eff < Number(line.amountConverted) && "text-good",
                      )}
                    >
                      {fmt(eff)}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ) : null}

      {mode === "table" ? (
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                {tx({ es: "Filtrar", en: "Filter" })}
              </span>
              {(
                [
                  ["all", t.monthGrid.filterAll],
                  ["recurring", t.monthGrid.filterRecurring],
                  ["oneoff", t.monthGrid.filterOneOff],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={cn(
                    "rounded-full border border-[color:var(--border)] px-3 py-1.5 text-sm",
                    filter === id && "bg-ink text-cream-soft border-ink",
                  )}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className="text-muted-foreground ml-auto rounded-full border border-[color:var(--border)] px-3 py-1.5 text-sm"
                onClick={() => setCollapsed(new Set())}
              >
                {t.monthGrid.expandAll}
              </button>
              <button
                type="button"
                className="text-muted-foreground rounded-full border border-[color:var(--border)] px-3 py-1.5 text-sm"
                onClick={() => setCollapsed(new Set(bankOrder))}
              >
                {t.monthGrid.collapseAll}
              </button>
            </div>
            <p className="text-muted-foreground mb-2 text-xs">{t.monthGrid.tipFilterHint}</p>

            {filtered.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                {t.monthGrid.emptyMonth}
              </p>
            ) : (
              <div className="max-h-[min(52vh,520px)] overflow-auto rounded-2xl border border-[color:var(--border)] bg-white">
                <table className="w-full border-collapse text-[13.5px]">
                  <thead className="bg-cream-soft sticky top-0 z-[1]">
                    <tr className="text-muted-foreground text-[10px] tracking-[0.12em] uppercase">
                      <th className="px-3.5 py-2.5 text-left font-bold">{t.monthGrid.colDate}</th>
                      <th className="px-3.5 py-2.5 text-left font-bold">{t.monthGrid.colName}</th>
                      <th className="px-3.5 py-2.5 text-left font-bold">
                        {t.monthGrid.colCategory}
                      </th>
                      <th className="px-3.5 py-2.5 text-left font-bold">{t.monthGrid.colKind}</th>
                      <th className="px-3.5 py-2.5 text-left font-bold">{t.monthGrid.colPaid}</th>
                      <th className="px-3.5 py-2.5 text-right font-bold">
                        {t.monthGrid.colAmount}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankOrder.map((bankId) => {
                      const group = filtered.filter((l) => l.bankId === bankId);
                      if (!group.length) return null;
                      const bank = bankTotals.find((b) => b.bankId === bankId) ?? {
                        bankId,
                        bankName: group[0]?.bankName ?? bankId,
                        color: null,
                        planned: 0,
                        paid: 0,
                      };
                      const sub = group.reduce(
                        (s, l) =>
                          s +
                          effectiveAmountConverted(
                            Number(l.amountConverted),
                            getSimLine(sim, l.id),
                          ),
                        0,
                      );
                      const isCollapsed = collapsed.has(bankId);
                      return (
                        <BankGroup
                          key={bankId}
                          bank={bank}
                          count={group.length}
                          sub={sub}
                          fmt={fmt}
                          collapsed={isCollapsed}
                          lineCountLabel={t.monthGrid.lineCount(group.length)}
                          onToggle={() =>
                            setCollapsed((prev) => {
                              const next = new Set(prev);
                              if (next.has(bankId)) next.delete(bankId);
                              else next.add(bankId);
                              return next;
                            })
                          }
                          onAskBank={(e) =>
                            openAsk(
                              {
                                focus: { type: "bank", bankId },
                                label: `${bank.bankName} · ${fmt(sub)}`,
                              },
                              e.clientX,
                              e.clientY,
                            )
                          }
                        >
                          {!isCollapsed
                            ? group.map((line) => {
                                const eff = effectiveAmountConverted(
                                  Number(line.amountConverted),
                                  getSimLine(sim, line.id),
                                );
                                const off = !getSimLine(sim, line.id).included;
                                return (
                                  <tr
                                    key={line.id}
                                    className={cn(
                                      "border-b border-[color:var(--border)]/50 hover:bg-lime/10",
                                      off && "opacity-40 line-through",
                                    )}
                                  >
                                    <td
                                      className="text-muted-foreground cursor-pointer px-3.5 py-2 tabular-nums"
                                      onClick={(e) =>
                                        onCellClick(e, {
                                          focus: {
                                            type: "line",
                                            lineId: line.id,
                                            field: "date",
                                          },
                                          label: `${line.name} · ${line.occurredOn.slice(8)}/${line.occurredOn.slice(5, 7)}`,
                                          line,
                                        })
                                      }
                                    >
                                      {line.occurredOn.slice(8)}/{line.occurredOn.slice(5, 7)}
                                    </td>
                                    <td
                                      className="cursor-pointer px-3.5 py-2 font-medium"
                                      onClick={(e) =>
                                        onCellClick(
                                          e,
                                          {
                                            focus: {
                                              type: "line",
                                              lineId: line.id,
                                              field: "name",
                                            },
                                            label: line.name,
                                            line,
                                          },
                                          true,
                                        )
                                      }
                                      onDoubleClick={(e) =>
                                        onCellDblClick(e, line.id, "name")
                                      }
                                    >
                                      {editing?.lineId === line.id &&
                                      editing.field === "name" ? (
                                        <input
                                          className="w-full rounded border border-lilac bg-white px-1 py-0.5 outline-none"
                                          defaultValue={line.name}
                                          autoFocus
                                          onBlur={(ev) => {
                                            if (skipBlurCommit.current) {
                                              skipBlurCommit.current = false;
                                              return;
                                            }
                                            commitEdit(line.id, "name", ev.target.value);
                                          }}
                                          onKeyDown={(ev) =>
                                            editKey(
                                              ev,
                                              () =>
                                                commitEdit(
                                                  line.id,
                                                  "name",
                                                  (ev.target as HTMLInputElement).value,
                                                ),
                                              () => {
                                                skipBlurCommit.current = true;
                                                setEditing(null);
                                              },
                                            )
                                          }
                                        />
                                      ) : (
                                        line.name
                                      )}
                                    </td>
                                    <td
                                      className="text-muted-foreground cursor-pointer px-3.5 py-2"
                                      onClick={(e) =>
                                        onCellClick(
                                          e,
                                          {
                                            focus: {
                                              type: "line",
                                              lineId: line.id,
                                              field: "category",
                                            },
                                            label: `${line.name} · ${catLabel(line.category)}`,
                                            line,
                                          },
                                          true,
                                        )
                                      }
                                      onDoubleClick={(e) =>
                                        onCellDblClick(e, line.id, "category")
                                      }
                                    >
                                      {editing?.lineId === line.id &&
                                      editing.field === "category" ? (
                                        <select
                                          className="w-full rounded border border-lilac bg-white px-1 py-0.5"
                                          defaultValue={line.category}
                                          autoFocus
                                          onBlur={(ev) =>
                                            commitEdit(
                                              line.id,
                                              "category",
                                              ev.target.value,
                                            )
                                          }
                                          onChange={(ev) =>
                                            commitEdit(line.id, "category", ev.target.value)
                                          }
                                        >
                                          {expenseCategoryOptions.map((c) => (
                                            <option key={c} value={c}>
                                              {catLabel(c)}
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        catLabel(line.category)
                                      )}
                                    </td>
                                    <td
                                      className="cursor-pointer px-3.5 py-2"
                                      onClick={(e) =>
                                        onCellClick(e, {
                                          focus: {
                                            type: "line",
                                            lineId: line.id,
                                            field: "type",
                                          },
                                          label: `${line.name} · ${line.kind === "RECURRING" ? t.monthGrid.kindRecurring : t.monthGrid.kindOneOff}`,
                                          line,
                                        })
                                      }
                                    >
                                      <span
                                        className={cn(
                                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                          line.kind === "RECURRING"
                                            ? "bg-lime/45 text-[#2d5a12]"
                                            : "bg-peach/55 text-[#8a3d18]",
                                        )}
                                      >
                                        {line.kind === "RECURRING"
                                          ? t.monthGrid.kindRecurring
                                          : t.monthGrid.kindOneOff}
                                      </span>
                                    </td>
                                    <td
                                      className="cursor-pointer px-3.5 py-2"
                                      onClick={(e) =>
                                        onCellClick(
                                          e,
                                          {
                                            focus: {
                                              type: "line",
                                              lineId: line.id,
                                              field: "paid",
                                            },
                                            label: `${line.name} · ${line.paid ? t.month.paid : t.month.unpaid}`,
                                            line,
                                          },
                                          true,
                                        )
                                      }
                                      onDoubleClick={(e) =>
                                        onCellDblClick(e, line.id, "paid")
                                      }
                                    >
                                      <span
                                        className={cn(
                                          "inline-flex size-[18px] items-center justify-center rounded-[6px] border border-ink/20 text-[11px]",
                                          line.paid &&
                                            "border-lime-deep bg-lime text-ink",
                                        )}
                                      >
                                        {line.paid ? <Check className="size-3" /> : null}
                                      </span>
                                    </td>
                                    <td
                                      className={cn(
                                        "cursor-pointer px-3.5 py-2 text-right tabular-nums",
                                        eff < Number(line.amountConverted) && "text-good",
                                      )}
                                      onClick={(e) =>
                                        onCellClick(
                                          e,
                                          {
                                            focus: {
                                              type: "line",
                                              lineId: line.id,
                                              field: "amount",
                                            },
                                            label: `${line.name} · ${fmt(eff)}`,
                                            line,
                                          },
                                          true,
                                        )
                                      }
                                      onDoubleClick={(e) =>
                                        onCellDblClick(e, line.id, "amount")
                                      }
                                    >
                                      {editing?.lineId === line.id &&
                                      editing.field === "amount" ? (
                                        <input
                                          type="number"
                                          min={0}
                                          step="0.01"
                                          className="w-full rounded border border-lilac bg-white px-1 py-0.5 text-right outline-none"
                                          defaultValue={line.amount}
                                          autoFocus
                                          onBlur={(ev) => {
                                            if (skipBlurCommit.current) {
                                              skipBlurCommit.current = false;
                                              return;
                                            }
                                            commitEdit(line.id, "amount", ev.target.value);
                                          }}
                                          onKeyDown={(ev) =>
                                            editKey(
                                              ev,
                                              () =>
                                                commitEdit(
                                                  line.id,
                                                  "amount",
                                                  (ev.target as HTMLInputElement).value,
                                                ),
                                              () => {
                                                skipBlurCommit.current = true;
                                                setEditing(null);
                                              },
                                            )
                                          }
                                        />
                                      ) : (
                                        <>
                                          {fmt(eff)}
                                          {eff !== Number(line.amountConverted) ? (
                                            <span className="text-muted-foreground block text-[10px] no-underline">
                                              {t.monthGrid.wasAmount(
                                                fmt(Number(line.amountConverted)),
                                              )}
                                            </span>
                                          ) : null}
                                        </>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            : null}
                        </BankGroup>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-ink text-cream-soft">
                      <td colSpan={5} className="px-3.5 py-3 font-semibold">
                        {t.monthGrid.totalVisible}
                      </td>
                      <td className="px-3.5 py-3 text-right font-semibold tabular-nums">
                        {fmt(visibleGrand)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <aside className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                {t.monthGrid.chatTitle}
              </p>
              <button
                type="button"
                className="text-muted-foreground text-xs underline"
                onClick={() => setMessages([])}
              >
                {t.monthGrid.chatClear}
              </button>
            </div>
            <div className="flex h-[min(62vh,580px)] flex-col overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white/80">
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3.5">
                {messages.length === 0 ? (
                  <div className="text-muted-foreground m-auto px-4 text-center text-sm leading-relaxed">
                    <p className="font-display text-ink mb-1 font-semibold">
                      {t.monthGrid.chatEmptyTitle}
                    </p>
                    <p>{t.monthGrid.chatEmptyBody}</p>
                  </div>
                ) : (
                  messages.map((m) => <ChatBubble key={m.id} message={m} />)
                )}
                {isStreaming ? (
                  <div className="bg-cream/85 self-start rounded-2xl rounded-bl-sm border border-[color:var(--border)] px-3 py-2 text-xs">
                    <span className="inline-flex gap-1">
                      <i className="bg-muted-foreground size-1.5 animate-pulse rounded-full" />
                      <i className="bg-muted-foreground size-1.5 animate-pulse rounded-full [animation-delay:150ms]" />
                      <i className="bg-muted-foreground size-1.5 animate-pulse rounded-full [animation-delay:300ms]" />
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="bg-cream/45 text-muted-foreground border-t border-[color:var(--border)] px-3.5 py-2.5 text-[11px]">
                {askCtx
                  ? t.monthGrid.chatContext(askCtx.label)
                  : t.monthGrid.chatNoContext}
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {floatOpen && askCtx ? (
        <div
          className="fixed z-[80] w-[min(420px,calc(100vw-24px))]"
          style={{ left: floatPos.left, top: floatPos.top }}
          role="dialog"
          aria-label={t.monthGrid.floatAskingAbout}
        >
          <div className="overflow-hidden rounded-[14px] border border-ink/15 bg-white/95 shadow-[0_0_0_1px_rgba(184,240,110,0.25),0_24px_60px_-20px_rgba(26,20,51,0.45)] backdrop-blur">
            <div className="text-muted-foreground flex items-center gap-2 px-3 pt-2.5 text-[11px]">
              <span>{t.monthGrid.floatAskingAbout}</span>
              <span className="text-ink max-w-[70%] truncate rounded-full border border-[color:var(--border)] bg-ink/5 px-2.5 py-1 text-xs font-semibold">
                {askCtx.label}
              </span>
              <button
                type="button"
                className="text-muted-foreground hover:text-ink ml-auto px-1 text-lg leading-none"
                aria-label={t.common.close}
                onClick={closeFloat}
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex items-end gap-2 px-3 py-2.5">
              <textarea
                ref={floatInputRef}
                rows={1}
                className="max-h-24 flex-1 resize-none bg-transparent text-sm outline-none"
                placeholder={t.monthGrid.floatPlaceholder}
                value={floatText}
                onChange={(e) => setFloatText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submitAsk();
                  }
                  if (e.key === "Escape") closeFloat();
                }}
              />
              <button
                type="button"
                disabled={!floatText.trim() || isStreaming}
                className="bg-ink text-cream-soft inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] disabled:opacity-35"
                aria-label={t.chat.composerSend}
                onClick={() => void submitAsk()}
              >
                <Send className="size-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 px-3 pb-3">
              {(askCtx.focus.type === "line"
                ? [
                    t.monthGrid.floatHintMuch,
                    t.monthGrid.floatHintRemove,
                    t.monthGrid.floatHintCategory,
                  ]
                : askCtx.focus.type === "bank"
                  ? [t.monthGrid.floatHintBank, t.monthGrid.floatHintSave]
                  : [t.monthGrid.floatHintSave, t.monthGrid.floatHintMuch]
              ).map((h) => (
                <button
                  key={h}
                  type="button"
                  className="bg-cream/70 text-muted-foreground hover:bg-lime/40 hover:text-ink rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[11px]"
                  onClick={() => setFloatText(h)}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="bg-ink text-cream-soft fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-full px-4 py-2.5 text-sm shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function editKey(
  ev: KeyboardEvent,
  commit: () => void,
  cancel: () => void,
) {
  if (ev.key === "Enter") {
    ev.preventDefault();
    commit();
  }
  if (ev.key === "Escape") {
    ev.preventDefault();
    cancel();
  }
}

function BankGroup({
  bank,
  count,
  sub,
  fmt,
  collapsed,
  lineCountLabel,
  onToggle,
  onAskBank,
  children,
}: {
  bank: BankTotal;
  count: number;
  sub: number;
  fmt: (n: number) => string;
  collapsed: boolean;
  lineCountLabel: string;
  onToggle: () => void;
  onAskBank: (e: ReactMouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr className="bg-gradient-to-r from-white to-cream-soft/90 border-b border-[color:var(--border)]">
        <td colSpan={5} className="px-3.5 py-2.5">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className="text-muted-foreground"
              aria-expanded={!collapsed}
              onClick={onToggle}
            >
              <ChevronDown
                className={cn("size-3.5 transition", collapsed && "-rotate-90")}
              />
            </button>
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: bank.color ?? "#7ec83a" }}
            />
            <button
              type="button"
              className="font-display cursor-pointer text-[15px] font-semibold hover:underline"
              onClick={onAskBank}
            >
              {bank.bankName}
            </button>
            <span className="text-muted-foreground text-xs">
              {lineCountLabel}
              <span className="sr-only"> ({count})</span>
            </span>
          </div>
        </td>
        <td
          className="cursor-pointer px-3.5 py-2.5 text-right text-[15px] font-semibold tabular-nums"
          onClick={onAskBank}
        >
          {fmt(sub)}
        </td>
      </tr>
      {children}
    </>
  );
}

function ChatBubble({ message }: { message: UIMessage }) {
  const text = message.parts
    ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("") ?? "";
  if (message.role === "user") {
    return (
      <div className="bg-ink text-cream-soft max-w-[92%] self-end rounded-2xl rounded-br-sm px-3 py-2.5 text-[13px] leading-snug whitespace-pre-wrap">
        {text}
      </div>
    );
  }
  return (
    <div className="bg-cream/85 max-w-[95%] self-start rounded-2xl rounded-bl-sm border border-[color:var(--border)] px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap">
      <div className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-[11px] font-bold">
        <span className="bg-ink text-cream-soft font-display flex size-5 items-center justify-center rounded-full text-[10px]">
          C
        </span>
        Clara
      </div>
      {text}
    </div>
  );
}
