import { z } from "zod";

const monthRegex = /^\d{4}-\d{2}$/;
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

export const paymentToggleSchema = z.object({
  month: z.string().regex(monthRegex, "month must be yyyy-MM."),
});

export const settingsSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

export const monthlyIncomeSchema = z.object({
  amount: z.coerce.number().min(0, "Monthly income must be zero or positive."),
});
