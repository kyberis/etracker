import type { ExpenseCategory, IncomeCategory } from "@prisma/client";

const EXPENSE_HINTS: Array<{ re: RegExp; category: ExpenseCategory }> = [
  { re: /rent|alquiler|mortgage|hipoteca|housing/i, category: "VIVIENDA" },
  { re: /electric|gas|water|internet|phone|utility|servicio/i, category: "SERVICIOS" },
  { re: /uber|taxi|fuel|gasolin|transport|metro|train|parking/i, category: "TRANSPORTE" },
  { re: /grocery|supermarket|restaurant|food|cafe|coffee|aliment/i, category: "ALIMENTACION" },
  { re: /pharmacy|hospital|clinic|salud|health|doctor/i, category: "SALUD" },
  { re: /school|tuition|universidad|educ/i, category: "EDUCACION" },
  { re: /netflix|spotify|cinema|cinema|game|entreten/i, category: "ENTRETENIMIENTO" },
  { re: /subscription|suscrip/i, category: "SUSCRIPCIONES" },
  { re: /loan|credit card|deuda|interest/i, category: "DEUDAS" },
  { re: /tax|impuest|vat|iva/i, category: "IMPUESTOS" },
  { re: /savings|ahorro|transfer to savings/i, category: "AHORRO" },
  { re: /gift|regalo/i, category: "REGALOS" },
  { re: /crypto|bitcoin|btc/i, category: "CRYPTO" },
  { re: /broker|stock|share|etf/i, category: "STOCK" },
];

const INCOME_HINTS: Array<{ re: RegExp; category: IncomeCategory }> = [
  { re: /salary|sueldo|payroll|wage/i, category: "SUELDO" },
  { re: /freelance|invoice|honorario/i, category: "FREELANCE" },
  { re: /dividend|interest|yield|invers/i, category: "INVERSIONES" },
  { re: /rent received|alquiler cobrado/i, category: "ALQUILER" },
  { re: /bonus|aguinaldo|bono/i, category: "BONO" },
  { re: /refund|reembolso|cashback/i, category: "REEMBOLSO" },
  { re: /gift|regalo/i, category: "REGALO" },
];

export function categorizeExpense(text: string): ExpenseCategory {
  for (const hint of EXPENSE_HINTS) {
    if (hint.re.test(text)) return hint.category;
  }
  return "OTROS";
}

export function categorizeIncome(text: string): IncomeCategory {
  for (const hint of INCOME_HINTS) {
    if (hint.re.test(text)) return hint.category;
  }
  return "OTROS";
}
