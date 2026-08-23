import { z } from "zod";

export const aspspSchema = z.object({
  name: z.string(),
  country: z.string(),
  maximum_consent_validity: z.number().optional(),
  psu_types: z.array(z.string()).optional(),
  auth_methods: z.array(z.unknown()).optional(),
});

export const aspspListSchema = z.object({
  aspsps: z.array(aspspSchema),
});

export const startAuthResponseSchema = z.object({
  url: z.string().url(),
  authorization_id: z.string().optional(),
});

const accountIdentificationSchema = z
  .object({
    iban: z.string().optional(),
    other: z
      .object({
        identification: z.string().optional(),
        scheme_name: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export const sessionAccountSchema = z
  .object({
    uid: z.string().optional(),
    name: z.string().optional().nullable(),
    details: z.string().optional().nullable(),
    product: z.string().optional().nullable(),
    currency: z.string().optional().nullable(),
    identification: accountIdentificationSchema.optional(),
    account_id: accountIdentificationSchema.optional(),
    cash_account_type: z.string().optional().nullable(),
  })
  .passthrough();

export const sessionSchema = z.object({
  session_id: z.string(),
  accounts: z.array(sessionAccountSchema),
  access: z
    .object({
      valid_until: z.string().optional(),
    })
    .optional(),
  aspsp: z
    .object({
      name: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
});

export const amountSchema = z.object({
  amount: z.union([z.string(), z.number()]),
  currency: z.string().optional(),
});

export const transactionSchema = z
  .object({
    transaction_id: z
      .union([
        z.string(),
        z.object({
          transaction_id: z.string().optional(),
        }),
      ])
      .optional(),
    entry_reference: z.string().optional(),
    booking_date: z.string().optional().nullable(),
    value_date: z.string().optional().nullable(),
    transaction_date: z.string().optional().nullable(),
    transaction_amount: amountSchema.optional(),
    credit_debit_indicator: z.enum(["CRDT", "DBIT"]).optional(),
    remittance_information: z
      .union([z.array(z.string()), z.string()])
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        return (Array.isArray(value) ? value : [value]).filter(Boolean);
      }),
    note: z.string().optional().nullable(),
    creditor: z.object({ name: z.string().optional() }).passthrough().optional(),
    debtor: z.object({ name: z.string().optional() }).passthrough().optional(),
    creditor_agent: z.object({ name: z.string().optional() }).passthrough().optional(),
    debtor_agent: z.object({ name: z.string().optional() }).passthrough().optional(),
    merchant_category_code: z.string().optional().nullable(),
    bank_transaction_code: z
      .object({
        description: z.string().optional(),
        code: z.string().optional(),
        sub_code: z.string().optional(),
        domain_code: z.string().optional(),
      })
      .optional(),
    status: z.string().optional(),
  })
  .passthrough();

export const transactionListSchema = z.object({
  transactions: z.array(transactionSchema),
  continuation_key: z.string().optional().nullable(),
});

export const balanceSchema = z
  .object({
    name: z.string().optional(),
    balance_amount: amountSchema.optional(),
    balance_type: z.string().optional(),
  })
  .passthrough();

export const balanceListSchema = z.object({
  balances: z.array(balanceSchema),
});

export const enableBankingErrorSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
  code: z.string().optional(),
});

export type Aspsp = z.infer<typeof aspspSchema>;
export type EnableBankingSession = z.infer<typeof sessionSchema>;
export type EnableBankingAccount = z.infer<typeof sessionAccountSchema>;
export type EnableBankingTransaction = z.infer<typeof transactionSchema>;
