import type { RecurringCandidate } from "@/lib/ai/recurring-candidates-spec";
import type { MonthLinePayload } from "@/lib/month-page-types";
import type { ExpenseCategory } from "@prisma/client";
import { expenseCategoryOptions } from "@/lib/validators";

export type ExistingExpenseTemplate = {
  name: string;
  amount: string | number;
  bankId: string;
  isRecurring: boolean;
};

function normalizeExpenseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function amountsMatch(a: number, b: number, tolerance = 0.02): boolean {
  return Math.abs(a - b) <= tolerance;
}

function toExpenseCategory(
  category: string,
): ExpenseCategory | undefined {
  return (expenseCategoryOptions as readonly string[]).includes(category)
    ? (category as ExpenseCategory)
    : undefined;
}

const RECURRING_NAME_HINTS = [
  "netflix",
  "spotify",
  "alquiler",
  "rent",
  "internet",
  "luz",
  "gas",
  "agua",
  "edesur",
  "edenor",
  "personal",
  "movistar",
  "claro",
  "fibertel",
  "cable",
  "gym",
  "gimnasio",
  "seguro",
  "insurance",
  "subscription",
  "suscripcion",
  "disney",
  "hbo",
  "youtube",
  "icloud",
  "aws",
  "hosting",
] as const;

export function isLikelyRecurringLine(line: MonthLinePayload): boolean {
  if (
    line.category === "VIVIENDA" ||
    line.category === "SUSCRIPCIONES" ||
    line.category === "SERVICIOS"
  ) {
    return true;
  }
  const normalized = normalizeExpenseName(line.name);
  return RECURRING_NAME_HINTS.some((hint) => normalized.includes(hint));
}

export function matchesExistingRecurringTemplate(
  line: Pick<MonthLinePayload, "name" | "bankId"> & { amount: number },
  templates: ExistingExpenseTemplate[],
): boolean {
  const normalizedName = normalizeExpenseName(line.name);
  return templates.some(
    (template) =>
      template.isRecurring &&
      normalizeExpenseName(template.name) === normalizedName &&
      amountsMatch(Number(template.amount), line.amount) &&
      template.bankId === line.bankId,
  );
}

/**
 * Builds widget candidates from one-off month lines, deduped and capped at 40.
 * Skips lines already linked to templates, event-wallet lines, and rows that
 * match an existing recurring template (same name+amount+bank).
 */
export function buildRecurringCandidatesFromMonth(params: {
  month: string;
  lines: MonthLinePayload[];
  existingTemplates: ExistingExpenseTemplate[];
}): RecurringCandidate[] {
  const seen = new Set<string>();
  const candidates: RecurringCandidate[] = [];

  for (const line of params.lines) {
    if (line.kind === "RECURRING" || line.templateId !== null) continue;
    if (line.event !== null) continue;

    const amount = Number(line.amountConverted);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const dedupeKey = `${normalizeExpenseName(line.name)}|${amount.toFixed(2)}|${line.bankId}`;
    if (seen.has(dedupeKey)) continue;

    if (
      matchesExistingRecurringTemplate(
        { name: line.name, bankId: line.bankId, amount },
        params.existingTemplates,
      )
    ) {
      continue;
    }

    seen.add(dedupeKey);
    const startMonth =
      line.occurredOn.length >= 7 ? line.occurredOn.slice(0, 7) : params.month;
    const category = toExpenseCategory(line.category);

    candidates.push({
      id: `line-${line.id}`,
      name: line.name,
      amount,
      bankId: line.bankId,
      bankName: line.bankName,
      ...(category ? { category } : {}),
      startMonth,
      suggested: isLikelyRecurringLine(line),
    });
  }

  candidates.sort((a, b) => {
    const suggestedOrder = Number(Boolean(b.suggested)) - Number(Boolean(a.suggested));
    if (suggestedOrder !== 0) return suggestedOrder;
    return a.name.localeCompare(b.name, "es");
  });

  return candidates.slice(0, 40);
}
