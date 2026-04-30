import { z } from "zod";

import {
  MAX_DONATION_CENTS,
  MIN_DONATION_CENTS,
} from "@/lib/billing/pricing";

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

/**
 * ISO 4217 currency code (3 uppercase letters). Accepts lower-case input and
 * normalises it to upper-case. We never enumerate every possible code so the
 * AI can hand us anything the user mentions (USD, ARS, EUR, BRL, CLP, etc.).
 */
export const currencySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code (e.g. USD)."));

export const registerSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase().trim()),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
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
  /** Optional: change the original currency. Triggers an FX lookup server-side. */
  currency: currencySchema.optional(),
  /** Optional manual rate override (e.g. Argentine "blue dolar"). Skips the API. */
  fxRate: z.coerce.number().positive().optional(),
});

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const monthExpenseLineCreateSchema = z.object({
  name: z.string().min(1, "Name is required.").max(120),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  bankId: z.string().min(1, "Bank is required."),
  category: expenseCategorySchema.optional().default("OTROS"),
  /**
   * Original currency of the expense. Defaults to the user's primary currency
   * server-side when omitted; supplying it triggers an FX lookup.
   */
  currency: currencySchema.optional(),
  /** Optional manual rate override (e.g. Argentine "blue dolar"). Skips the API. */
  fxRate: z.coerce.number().positive().optional(),
  /** Optional override for `paid`; defaults to `false` server-side. */
  paid: z.coerce.boolean().optional(),
  /**
   * Fecha real del gasto (`yyyy-MM-dd`, UTC). Default server-side: hoy.
   * Forma parte de la clave de deduplicación junto a usuario, descripción
   * normalizada, monto y moneda.
   */
  occurredOn: z
    .string()
    .regex(isoDateRegex, "occurredOn must be yyyy-MM-dd.")
    .optional(),
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
  newPassword: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .optional(),
  expenseImportInstructions: z.union([z.string().max(12000), z.null()]).optional(),
  /** Primary currency in which all aggregations are reported. ISO 4217. */
  primaryCurrency: currencySchema.optional(),
  /** Preferred UI/agent language. Mirrored into the NEXT_LOCALE cookie. */
  locale: z.enum(["es", "en"]).optional(),
});

export const monthlyIncomeSchema = z.object({
  amount: z.coerce.number().min(0, "Monthly income must be zero or positive."),
});

export const carryoverDecisionSchema = z.object({
  mode: z.enum(["addToIncome", "setAside"]),
});

/**
 * Closed enum of usage reasons captured by the onboarding wizard. Stored as a
 * string array on `User.usageReasons`; the agent can read them as a hint but
 * we don't gate any feature on the value.
 */
export const usageReasonValues = [
  "personal",
  "couple_family",
  "freelance",
  "business",
  "other",
] as const;
export type UsageReason = (typeof usageReasonValues)[number];
export const usageReasonSchema = z.enum(usageReasonValues);

/** ISO-3166 alpha-2, normalised to upper-case. */
const onboardingCountrySchema = z
  .string()
  .trim()
  .length(2, "Country must be a 2-letter ISO code.")
  .regex(/^[a-zA-Z]{2}$/, "Country must be a 2-letter ISO code.")
  .transform((value) => value.toUpperCase());

/**
 * Body of `PATCH /api/onboarding`. Every field is optional so each step of the
 * wizard can persist what it has and bail; `complete: true` stamps
 * `onboardingCompletedAt` so the redirect gate stops sending the user back.
 */
export const onboardingSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "El nombre no puede estar vacío.")
      .max(80, "El nombre es demasiado largo.")
      .optional(),
    usageReasons: z.array(usageReasonSchema).max(usageReasonValues.length).optional(),
    country: onboardingCountrySchema.optional(),
    primaryCurrency: currencySchema.optional(),
    complete: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.usageReasons !== undefined ||
      data.country !== undefined ||
      data.primaryCurrency !== undefined ||
      data.complete !== undefined,
    { message: "Nada para actualizar." },
  );

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

const countryCodeSchema = z
  .string()
  .trim()
  .length(2, "Country must be a 2-letter ISO code.")
  .regex(/^[a-zA-Z]{2}$/, "Country must be a 2-letter ISO code.");

export const revolutInstitutionsQuerySchema = z.object({
  country: countryCodeSchema,
});

export const revolutConnectSchema = z.object({
  institutionId: z.string().min(1, "Institution is required."),
});

export const revolutSyncSchema = z.object({
  month: z.string().regex(monthRegex, "Month must be yyyy-MM."),
});

export const revolutIgnoreSchema = z.object({
  transactionIds: z.array(z.string().min(1)).min(1, "At least one transaction id is required."),
});

export const revolutDefaultBankSchema = z.object({
  bankId: z.string().min(1, "Bank is required."),
});

export const billingCheckoutSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("subscription") }),
  z.object({
    mode: z.literal("donation"),
    amountCents: z
      .number()
      .int("El monto debe ser un entero (centavos).")
      .min(MIN_DONATION_CENTS, `El monto mínimo es ${MIN_DONATION_CENTS / 100} EUR.`)
      .max(MAX_DONATION_CENTS, `El monto máximo es ${MAX_DONATION_CENTS / 100} EUR.`),
  }),
]);

export const adminFeatureFlagPatchSchema = z.object({
  enabled: z.boolean(),
});

export const adminFeatureFlagOverrideSchema = z.object({
  /** `null` removes the override (user falls back to global value). */
  enabled: z.union([z.boolean(), z.null()]),
});

export const adminUpdateUserSchema = z
  .object({
    isActive: z.boolean().optional(),
    dailyAgentMessageLimit: z
      .number()
      .int("El límite debe ser un entero.")
      .min(1, "El límite mínimo es 1.")
      .max(1000, "El límite máximo es 1000.")
      .optional(),
  })
  .refine(
    (data) =>
      data.isActive !== undefined || data.dailyAgentMessageLimit !== undefined,
    { message: "Nada para actualizar." },
  );
