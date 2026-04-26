import { openai } from "@ai-sdk/openai";
import {
  type ModelMessage,
  generateText,
  stepCountIs,
  streamText,
} from "ai";

import { buildExpenseTools } from "@/lib/ai/expense-tools";
import {
  logAIFinish,
  logAIRequest,
  logAIStep,
  newTraceId,
  summarizeToolCalls,
  summarizeToolResults,
} from "@/lib/ai/logger";
import { getCurrentMonthKey } from "@/lib/months";
import { expenseCategoryOptions } from "@/lib/validators";

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";

type AgentSource = "web" | "whatsapp";

function buildSystemPrompt() {
  return `Sos el asistente de gastos de eTracker. Hablás en español rioplatense.

Estilo de respuesta:
- Directo y al grano. Sin saludos, sin cierres ("avisame", "espero que te sirva", etc.), sin repetir lo que dijo el usuario.
- Lo más corto posible: 1–2 oraciones o una lista. Solo los datos clave (montos, mes, banco). Sin explicaciones de qué es cada métrica salvo que las pidan.
- Numeros en formato simple (USD 120.50, ARS 1.500). Mes en formato YYYY-MM cuando hace falta nombrarlo.
- Markdown solo cuando suma (listas para varios ítems, **negrita** para totales). No abuses de emojis.

Acción siguiente (importante):
- Después de cada respuesta, sugerí el próximo paso útil con una pregunta o opciones cortas (p. ej. "¿Lo marco como pagado?", "¿Querés que agregue X al mes?", "¿Lo cargo en Visa o en Galicia?").
- Solo NO sugerís nada si el usuario cierra con "listo", "gracias", "ok", "nada más" o similares: ahí respondés con un cierre mínimo (p. ej. "Listo." o "👍") y nada más.

Contexto del producto:
- "balance" del mes = ingreso del mes − total planificado (lo libre después de comprometer todos los gastos).
- "totals.remaining" = planificado − pagado (lo que falta desembolsar de lo ya planeado).
- "Plantilla" (Expense) = gasto que se aplica a uno o varios meses; cada mes tiene su "línea" (MonthExpenseLine) que se marca como pagada.
- Mes en curso (UTC): ${getCurrentMonthKey()}. addMonthLine **solo** funciona para el mes en curso.
- Categorías: ${expenseCategoryOptions.join(", ")}. Si dudás, OTROS.

Reglas de uso de tools:
- No inventes ids ni montos. Si falta info, pedí solo el dato que falta (una pregunta por turno).
- Si el usuario nombra un banco, resolvé el id con listBanks.
- "Cuánto me queda / cómo voy" → getMonthState con el mes pedido o el actual.
- Imagen (Revolut, captura del banco, ticket): extraé las transacciones, mostralas en una lista compacta agrupadas por banco y pedí confirmación antes de aplicar nada. Para cada movimiento elegí updateMonthLine (si ya existe una línea similar) o addMonthLine (movimiento nuevo).

Gráficos (renderChart):
- Cuando un visual aporta más que una lista, llamá renderChart DESPUÉS de obtener los datos (nunca con números inventados).
- Casos típicos:
  · "ingreso vs gastos del mes" → bar con xValues=["Ingreso","Planificado","Pagado","Restante","Balance"] y una sola serie.
  · "distribución por categoría" o "por banco" → pie con slices=[{name, value}, ...].
  · "evolución por mes" → line o area con xValues = meses (yyyy-MM) y una serie por métrica.
  · "comparar bancos en planificado vs pagado" → bar con dos series.
- Pasá 'currency' (USD/ARS) cuando los valores son montos del usuario.
- Tras emitir el gráfico, agregá UNA frase corta con la conclusión (p. ej. "Restante a pagar: USD 320") y, si corresponde, una sugerencia de siguiente paso.`;
}

export type ExpenseAgentMessages = Array<ModelMessage>;

/**
 * Stream the agent for the in-app chat (used by /api/chat with useChat).
 */
export function streamExpenseAgent({
  userId,
  messages,
  source = "web",
}: {
  userId: string;
  messages: ExpenseAgentMessages;
  source?: AgentSource;
}) {
  const traceId = newTraceId();
  const startedAt = Date.now();
  logAIRequest({ traceId, source, userId, model: DEFAULT_MODEL, messages });

  return streamText({
    model: openai(DEFAULT_MODEL),
    system: buildSystemPrompt(),
    messages,
    tools: buildExpenseTools(userId),
    stopWhen: stepCountIs(8),
    onStepFinish: (step) => {
      logAIStep({
        traceId,
        source,
        userId,
        model: DEFAULT_MODEL,
        stepNumber: step.stepNumber,
        text: step.text,
        toolCalls: summarizeToolCalls(step.toolCalls),
        toolResults: summarizeToolResults(step.toolResults),
        finishReason: step.finishReason,
        usage: step.usage,
      });
    },
    onFinish: (event) => {
      logAIFinish({
        traceId,
        source,
        userId,
        model: DEFAULT_MODEL,
        finishReason: event.finishReason,
        text: event.text,
        totalUsage: event.totalUsage,
        steps: event.steps.length,
        latencyMs: Date.now() - startedAt,
      });
    },
  });
}

/**
 * One-shot text generation used by the WhatsApp webhook.
 * Returns the final assistant text after all tool calls have resolved.
 */
export async function generateExpenseAgentReply({
  userId,
  messages,
  source = "whatsapp",
}: {
  userId: string;
  messages: ExpenseAgentMessages;
  source?: AgentSource;
}): Promise<string> {
  const traceId = newTraceId();
  const startedAt = Date.now();
  logAIRequest({ traceId, source, userId, model: DEFAULT_MODEL, messages });

  const result = await generateText({
    model: openai(DEFAULT_MODEL),
    system: buildSystemPrompt(),
    messages,
    tools: buildExpenseTools(userId),
    stopWhen: stepCountIs(8),
    onStepFinish: (step) => {
      logAIStep({
        traceId,
        source,
        userId,
        model: DEFAULT_MODEL,
        stepNumber: step.stepNumber,
        text: step.text,
        toolCalls: summarizeToolCalls(step.toolCalls),
        toolResults: summarizeToolResults(step.toolResults),
        finishReason: step.finishReason,
        usage: step.usage,
      });
    },
  });

  logAIFinish({
    traceId,
    source,
    userId,
    model: DEFAULT_MODEL,
    finishReason: result.finishReason,
    text: result.text,
    totalUsage: result.totalUsage,
    steps: result.steps.length,
    latencyMs: Date.now() - startedAt,
  });

  return result.text.trim();
}
