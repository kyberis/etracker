import { z } from "zod";

import { expenseCategoryOptions } from "@/lib/validators";

/**
 * Spec the agent emits via `proposeRecurringTemplates`. The chat UI
 * renders an interactive checklist; on confirm the client POSTs the
 * selected rows to `/api/expenses/bulk` (no second LLM turn).
 *
 * Flat schema (no discriminated unions) so it converts cleanly to JSON
 * Schema for tool calling — same constraint as `chart-spec.ts`.
 */

const monthKey = z
  .string()
  .regex(/^\d{4}-\d{2}$/u, "Month in yyyy-MM format.");

export const recurringCandidateSchema = z.object({
  /** Stable client key for the checkbox (agent-chosen, e.g. "spotify-1"). */
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  /** Amount in the user's primary currency (templates always store primary). */
  amount: z.number().positive(),
  bankId: z.string().min(1),
  bankName: z.string().min(1).max(80).optional(),
  category: z.enum(expenseCategoryOptions).optional(),
  startMonth: monthKey,
  endMonth: monthKey.nullable().optional(),
  /** Pre-check the row when true/omitted. */
  suggested: z.boolean().optional(),
  /** Short hint shown under the name (e.g. "sale todos los meses"). */
  reason: z.string().max(120).optional(),
});

export const recurringCandidatesSpecSchema = z.object({
  title: z.string().min(1).max(120),
  subtitle: z.string().max(280).optional(),
  candidates: z.array(recurringCandidateSchema).min(1).max(40),
});

export type RecurringCandidate = z.infer<typeof recurringCandidateSchema>;
export type RecurringCandidatesSpec = z.infer<
  typeof recurringCandidatesSpecSchema
>;
