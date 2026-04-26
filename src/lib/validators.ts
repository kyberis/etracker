import { z } from "zod";

const monthRegex = /^\d{4}-\d{2}$/;

const expenseCategoryValues = [
  "VIVIENDA",
  "SERVICIOS",
  "TRANSPORTE",
  "ALIMENTACION",
  "SALUD",
  "EDUCACION",
  "ENTRETENIMIENTO",
  "SUSCRIPCIONES",
  "DEUDAS",
  "IMPUESTOS",
  "AHORRO",
  "REGALOS",
  "CRYPTO",
  "STOCK",
  "OTROS",
] as const;

const INVESTMENT_CATEGORIES = new Set<string>(["CRYPTO", "STOCK"]);

export function isInvestmentCategory(category: string): boolean {
  return INVESTMENT_CATEGORIES.has(category);
}

export const expenseCategorySchema = z.enum(expenseCategoryValues);
export const expenseCategoryOptions = expenseCategoryValues;
const colorRegex = /^#?[0-9a-fA-F]{6}$/;

export const registerSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase().trim()),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const bankSchema = z.object({
  name: z.string().min(1, "Bank name is required.").max(80),
  color: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length ? value : undefined))
    .refine((value) => !value || colorRegex.test(value), "Color must be a hex code."),
});

export const expenseSchema = z
  .object({
    name: z.string().min(1, "Expense name is required.").max(120),
    amount: z.coerce.number().positive("Amount must be greater than 0."),
    bankId: z.string().min(1, "Bank is required."),
    isRecurring: z.coerce.boolean(),
    startMonth: z.string().regex(monthRegex, "startMonth must be yyyy-MM."),
    endMonth: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value && value.length ? value : undefined)),
    category: expenseCategorySchema.optional().default("OTROS"),
  })
  .refine(
    (data) => !data.endMonth || monthRegex.test(data.endMonth),
    "endMonth must be yyyy-MM when provided.",
  )
  .refine(
    (data) => {
      if (!data.isRecurring && data.endMonth) {
        return false;
      }
      return true;
    },
    {
      path: ["endMonth"],
      message: "One-off expenses cannot have an end month.",
    },
  )
  .refine(
    (data) => {
      if (!data.endMonth) {
        return true;
      }
      return data.endMonth >= data.startMonth;
    },
    {
      path: ["endMonth"],
      message: "End month must be after start month.",
    },
  );

export const monthParamSchema = z.object({
  month: z.string().regex(monthRegex, "Month must be yyyy-MM."),
});

export const createMonthSchema = z
  .object({
    month: z.string().regex(monthRegex, "Month must be yyyy-MM."),
    mode: z.enum(["templates", "copyFrom"]),
    copyFromMonth: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length ? v : undefined)),
  })
  .refine(
    (data) => {
      if (data.mode === "copyFrom" && !data.copyFromMonth) {
        return false;
      }
      if (data.copyFromMonth) {
        return monthRegex.test(data.copyFromMonth);
      }
      return true;
    },
    { message: "copyFromMonth must be yyyy-MM when mode is copyFrom.", path: ["copyFromMonth"] },
  );

export const monthExpenseLineUpdateSchema = z.object({
  paid: z.coerce.boolean().optional(),
  name: z.string().min(1).max(120).optional(),
  amount: z.coerce.number().positive().optional(),
});

export const monthExpenseLineCreateSchema = z.object({
  name: z.string().min(1, "Name is required.").max(120),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  bankId: z.string().min(1, "Bank is required."),
  category: expenseCategorySchema.optional().default("OTROS"),
});

export const yearParamSchema = z.object({
  year: z.coerce
    .number()
    .int()
    .min(1970)
    .max(2100),
});

export const settingsSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

export const monthlyIncomeSchema = z.object({
  amount: z.coerce.number().min(0, "Monthly income must be zero or positive."),
});

const phoneRegex = /^\+[1-9]\d{6,14}$/;

export const whatsappLinkStartSchema = z.object({
  phone: z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s\-()]/g, ""))
    .refine((value) => phoneRegex.test(value), {
      message: "Use formato internacional, p. ej. +5491112345678.",
    }),
});
