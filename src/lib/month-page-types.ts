export type MonthLinePayload = {
  id: string;
  name: string;
  amount: string;
  bankId: string;
  bankName: string;
  paid: boolean;
  category: string;
};

/** Expense template that applies to this month but has no line in the month bucket yet. */
export type PendingTemplateExpense = {
  templateId: string;
  name: string;
  amount: string;
  bankId: string;
  bankName: string;
  category: string;
};

export type MonthPageDataNoRecord = {
  month: string;
  hasRecord: false;
  defaultIncome: number;
  incomeHistory: Array<{ month: string; amount: number }>;
};

export type MonthPageDataWithRecord = {
  month: string;
  hasRecord: true;
  defaultIncome: number;
  income: number;
  /** True when this page’s month is the current calendar month (UTC). */
  isCurrentMonth: boolean;
  incomeHistory: Array<{ month: string; amount: number }>;
  totals: { planned: number; paid: number; remaining: number };
  /** income − total planned expenses */
  balance: number;
  bankTotals: Array<{
    bankId: string;
    bankName: string;
    color?: string | null;
    planned: number;
    paid: number;
  }>;
  expenses: MonthLinePayload[];
  banks: Array<{ id: string; name: string }>;
  /** Templates that apply to this month but are not yet copied into this bucket. */
  pendingFromTemplates: PendingTemplateExpense[];
};

export type MonthPageData = MonthPageDataNoRecord | MonthPageDataWithRecord;
