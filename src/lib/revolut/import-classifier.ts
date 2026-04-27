import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

import { expenseCategoryOptions, expenseCategorySchema } from "@/lib/validators";

import type { ImportableTransaction } from "./types";

const classificationSchema = z.object({
  decisions: z.array(
    z.object({
      transactionId: z.string(),
      /** Si false, el movimiento no se ofrece en el diálogo de importación. */
      includeInImport: z.boolean(),
      /** Categoría si se importa; puede ser OTROS si no aplica regla específica. */
      category: expenseCategorySchema,
      /** Una frase corta opcional (p. ej. "transferencia entre cuentas"). */
      note: z.string().max(240).optional(),
    }),
  ),
});

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";

/**
 * Aplica las instrucciones del usuario para filtrar movimientos importables y sugerir categoría.
 * Si no hay API key o falla el modelo, devuelve la lista sin cambios.
 */
export async function classifyImportableTransactions(
  userInstructions: string,
  transactions: ImportableTransaction[],
): Promise<ImportableTransaction[]> {
  const trimmed = userInstructions.trim();
  if (!trimmed.length || transactions.length === 0) {
    return transactions;
  }
  if (!process.env.OPENAI_API_KEY) {
    return transactions;
  }

  try {
    const { object } = await generateObject({
      model: openai(DEFAULT_MODEL),
      schema: classificationSchema,
      prompt: `Sos un clasificador de movimientos bancarios (débitos) para una app de gastos personales.

Categorías válidas (usá el enum exactamente): ${expenseCategoryOptions.join(", ")}.

Reglas:
1. El usuario escribió instrucciones personales: respetalas con prioridad máxima.
2. Transferencias entre cuentas propias, "top up", movimientos que solo mueven saldo sin ser un gasto real → includeInImport: false si las instrucciones lo indican o es obvio.
3. Para cada movimiento que sí debe importarse → includeInImport: true y una categoría coherente.
4. Debés incluir en "decisions" exactamente un objeto por cada transactionId que recibís en el JSON del usuario. No inventes ids nuevos ni omitas ninguno.

JSON de entrada (solo lectura):
${JSON.stringify(
        {
          userInstructions: trimmed,
          transactions: transactions.map((t) => ({
            transactionId: t.transactionId,
            description: t.description,
            amount: t.amount,
            currency: t.currency,
            bookingDate: t.bookingDate,
          })),
        },
        null,
        0,
      )}`,
    });

    const byId = new Map(object.decisions.map((d) => [d.transactionId, d]));
    const out: ImportableTransaction[] = [];

    for (const t of transactions) {
      const d = byId.get(t.transactionId);
      if (d && !d.includeInImport) {
        continue;
      }
      out.push({
        ...t,
        suggestedCategory: d?.category ?? "OTROS",
        assistantNote: d?.note,
      });
    }

    return out;
  } catch {
    return transactions;
  }
}
