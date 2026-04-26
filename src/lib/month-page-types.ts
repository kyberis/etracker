export type MonthLinePayload = {
  id: string;
  name: string;
  amount: string;
  bankId: string;
  bankName: string;
  paid: boolean;
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
  incomeHistory: Array<{ month: string; amount: number }>;
  totals: { planned: number; paid: number; remaining: number };
  bankTotals: Array<{
    bankId: string;
    bankName: string;
    color?: string | null;
    planned: number;
    paid: number;
  }>;
  expenses: MonthLinePayload[];
};

export type MonthPageData = MonthPageDataNoRecord | MonthPageDataWithRecord;
