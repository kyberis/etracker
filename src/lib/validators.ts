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

const incomeCategoryValues = [
  "SUELDO",
  "FREELANCE",
  "NEGOCIO",
  "INVERSIONES",
  "ALQUILER",
  "BONO",
  "REEMBOLSO",
  "REGALO",
  "OTROS",
] as const;

export const incomeCategorySchema = z.enum(incomeCategoryValues);
export const incomeCategoryOptions = incomeCategoryValues;
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
  /** Cloudflare Turnstile token; optional so self-hosters without keys still work. */
  turnstileToken: z.string().optional(),
  /**
   * GDPR Art. 7(1) — demonstrable consent. The signup form mounts a checkbox
   * that, when ticked, submits this field set to the current
   * `CURRENT_TERMS_VERSION`. Required so the server can reject signups that
   * never showed (or successfully bypassed) the checkbox.
   */
  acceptedTermsVersion: z
    .string()
    .min(1, "Tenés que aceptar los Términos y la Política de Privacidad."),
});

export const loginExtraSchema = z.object({
  /** Forwarded by the login form alongside email + password to NextAuth. */
  turnstileToken: z.string().optional(),
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

/**
 * Plantilla de ingreso (recurrente o de un solo mes). Espejo de
 * `expenseSchema`. Diferencias:
 * - `bankId` es opcional (los cobros no siempre se asocian a una cuenta).
 * - `currency` permite plantillas en moneda distinta a la principal (p.ej.
 *   un freelance que cobra en USD para un usuario con primary EUR).
 */
export const incomeSchema = z
  .object({
    name: z.string().min(1, "Income name is required.").max(120),
    amount: z.coerce.number().positive("Amount must be greater than 0."),
    bankId: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length ? v : undefined)),
    isRecurring: z.coerce.boolean(),
    startMonth: z.string().regex(monthRegex, "startMonth must be yyyy-MM."),
    endMonth: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value && value.length ? value : undefined)),
    category: incomeCategorySchema.optional().default("OTROS"),
    currency: currencySchema.optional(),
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
      message: "One-off incomes cannot have an end month.",
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

/**
 * Crear una línea de ingreso del mes. Espejo de
 * `monthExpenseLineCreateSchema` con `received` reemplazando a `paid` y
 * `bankId` opcional.
 */
export const monthIncomeLineCreateSchema = z.object({
  name: z.string().min(1, "Name is required.").max(120),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  bankId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length ? v : undefined)),
  category: incomeCategorySchema.optional().default("OTROS"),
  currency: currencySchema.optional(),
  fxRate: z.coerce.number().positive().optional(),
  /** Override de `received`; default server-side: false. */
  received: z.coerce.boolean().optional(),
  occurredOn: z
    .string()
    .regex(isoDateRegex, "occurredOn must be yyyy-MM-dd.")
    .optional(),
});

export const monthIncomeLineUpdateSchema = z.object({
  received: z.coerce.boolean().optional(),
  name: z.string().min(1).max(120).optional(),
  amount: z.coerce.number().positive().optional(),
  currency: currencySchema.optional(),
  fxRate: z.coerce.number().positive().optional(),
  /** Cambiar la cuenta donde cayó el cobro. `null` para desasociar. */
  bankId: z.union([z.string().min(1), z.null()]).optional(),
  category: incomeCategorySchema.optional(),
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
  /**
   * - `addToIncome` / `setAside`: solo válidos cuando el mes anterior cerró
   *   con sobrante (balance > 0).
   * - `coverFromSavings` / `carryDebt`: solo válidos cuando cerró en rojo
   *   (balance < 0). El servicio rechaza un mode que no corresponde con el
   *   signo del sobrante.
   */
  mode: z.enum(["addToIncome", "setAside", "coverFromSavings", "carryDebt"]),
});

const savingsMovementKindWriteSchema = z.enum(["MANUAL_DEPOSIT", "MANUAL_WITHDRAWAL"]);

export const savingsMovementCreateSchema = z.object({
  kind: savingsMovementKindWriteSchema,
  /** Magnitud positiva en la moneda principal del usuario. El signo se aplica server-side según `kind`. */
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  note: z.string().max(500).optional(),
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, "occurredOn must be yyyy-MM-dd.")
    .optional(),
});

export const savingsMovementUpdateSchema = z
  .object({
    amount: z.coerce.number().positive().optional(),
    note: z.union([z.string().max(500), z.null()]).optional(),
    occurredOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, "occurredOn must be yyyy-MM-dd.")
      .optional(),
  })
  .refine(
    (d) => d.amount !== undefined || d.note !== undefined || d.occurredOn !== undefined,
    { message: "Nada para actualizar." },
  );

export const monthlySavingsContributionSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  note: z.string().max(500).optional(),
});

const eventColorSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length ? value : undefined))
  .refine((value) => !value || colorRegex.test(value), "Color must be a hex code.");

const eventAttributionModeSchema = z.enum(["BY_DATE", "LUMP_SUM"]);

export const eventCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Event name is required.").max(120),
    startDate: z
      .string()
      .regex(isoDateRegex, "startDate must be yyyy-MM-dd."),
    endDate: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length ? v : undefined))
      .refine(
        (v) => v === undefined || isoDateRegex.test(v),
        "endDate must be yyyy-MM-dd when provided.",
      ),
    color: eventColorSchema,
    attributionMode: eventAttributionModeSchema.optional(),
  })
  .refine(
    (data) => !data.endDate || data.endDate >= data.startDate,
    { path: ["endDate"], message: "endDate must be after startDate." },
  );

export const eventUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    startDate: z
      .string()
      .regex(isoDateRegex, "startDate must be yyyy-MM-dd.")
      .optional(),
    /** Pass `null` explicitly to clear endDate (leave the event open-ended). */
    endDate: z
      .union([z.string().regex(isoDateRegex, "endDate must be yyyy-MM-dd."), z.null()])
      .optional(),
    color: z
      .union([
        z
          .string()
          .trim()
          .refine((v) => v === "" || colorRegex.test(v), "Color must be a hex code."),
        z.null(),
      ])
      .optional(),
    attributionMode: eventAttributionModeSchema.optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.startDate !== undefined ||
      data.endDate !== undefined ||
      data.color !== undefined ||
      data.attributionMode !== undefined,
    { message: "Nada para actualizar." },
  );

export const eventCloseSchema = z
  .object({
    attributionMode: eventAttributionModeSchema,
    /** Required when attributionMode = LUMP_SUM. */
    attributionMonth: z
      .string()
      .regex(monthRegex, "attributionMonth must be yyyy-MM.")
      .optional(),
  })
  .refine(
    (data) =>
      data.attributionMode === "BY_DATE" || data.attributionMonth !== undefined,
    {
      path: ["attributionMonth"],
      message: "attributionMonth is required when attributionMode is LUMP_SUM.",
    },
  );

export const eventAttachLineSchema = z.object({
  lineId: z.string().min(1, "lineId is required."),
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
    /**
     * GDPR Art. 7(1) — version string the user just consented to. The
     * onboarding endpoint stamps `acceptedTermsAt = now()` when this is set
     * and matches `CURRENT_TERMS_VERSION`. Used by the dedicated
     * `/accept-terms` flow (Google sign-in first time, legacy users without
     * consent, post-version-bump re-acceptance).
     */
    acceptedTermsVersion: z.string().min(1).optional(),
    complete: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.usageReasons !== undefined ||
      data.country !== undefined ||
      data.primaryCurrency !== undefined ||
      data.acceptedTermsVersion !== undefined ||
      data.complete !== undefined,
    { message: "Nada para actualizar." },
  );

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

/** Public contact form payload — see `POST /api/contact`. */
export const contactMessageKindSchema = z.enum([
  "PRIVACY",
  "ABUSE",
  "BUG",
  "GENERAL",
]);

export const contactMessageSchema = z.object({
  kind: contactMessageKindSchema,
  name: z.string().trim().min(1, "Tu nombre es obligatorio.").max(80),
  email: z
    .string()
    .email("El email no es válido.")
    .transform((value) => value.toLowerCase().trim()),
  body: z
    .string()
    .trim()
    .min(10, "Contanos un poquito más, mínimo 10 caracteres.")
    .max(5000, "Demasiado largo. Máximo 5000 caracteres."),
  /** Optional Turnstile token; verified server-side. */
  turnstileToken: z.string().optional(),
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

// ---------------------------------------------------------------------------
// Shared event wallets
// ---------------------------------------------------------------------------

/**
 * Payload for `POST /api/events/share/[token]/accept`.
 *
 * `mode = "guest"`: anonymous accept (the visitor has no Clara session).
 * Requires a `displayName` so the chat can refer to them naturally.
 * `locale` is optional; we sniff the URL `[lang]` segment when omitted.
 *
 * `mode = "registered"`: the visitor is logged in (a NextAuth session is
 * required by the route). `displayName` is optional — defaults to the
 * caller's `User.name ?? email`.
 */
export const eventShareAcceptSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("guest"),
    displayName: z
      .string()
      .trim()
      .min(1, "Decinos cómo querés que te llamen.")
      .max(80, "Demasiado largo (máximo 80 caracteres)."),
    locale: z.string().trim().min(2).max(8).optional(),
  }),
  z.object({
    mode: z.literal("registered"),
    displayName: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .optional(),
  }),
]);

/** Payload for `POST /api/auth/upgrade-guest`. */
export const guestUpgradeSchema = z.object({
  guestUserId: z.string().min(1),
  email: z
    .string()
    .email("El email no es válido.")
    .transform((value) => value.toLowerCase().trim()),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .max(128, "La contraseña es demasiado larga."),
  acceptedTermsVersion: z.string().min(1, "Tenés que aceptar los Términos."),
  /** Optional override for `User.locale` (defaults to keeping current). */
  locale: z.string().trim().min(2).max(8).optional(),
});

/**
 * Refinement for tools/routes that take an optional `paidByUserId` on a
 * monthly expense line. Empty strings are coerced to `undefined` so a
 * blank form field is treated the same as "not specified".
 */
export const paidByUserIdSchema = z
  .string()
  .trim()
  .min(1)
  .optional()
  .or(z.literal("").transform(() => undefined));
