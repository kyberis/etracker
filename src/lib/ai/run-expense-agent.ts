import { createOpenAI } from "@ai-sdk/openai";
import {
  type ModelMessage,
  generateText,
  stepCountIs,
  streamText,
} from "ai";

import { resilientOpenAiFetch } from "@/lib/ai/resilient-openai-fetch";

import { buildExpenseTools } from "@/lib/ai/expense-tools";
import {
  logAIFinish,
  logAIRequest,
  logAIStep,
  newTraceId,
  summarizeToolCalls,
  summarizeToolResults,
} from "@/lib/ai/logger";
import { db } from "@/lib/db";
import { getCurrentMonthKey } from "@/lib/months";
import { expenseCategoryOptions } from "@/lib/validators";

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";

/** OpenAI SDK instance with resilient HTTP retries (429/rate bursts). */
const expenseAgentOpenAi = createOpenAI({ fetch: resilientOpenAiFetch });

const OPENAI_CHAT_MAX_RETRIES = Math.min(
  12,
  Math.max(4, Number.parseInt(process.env.OPENAI_CHAT_MAX_RETRIES ?? "10", 10) || 10),
);

type AgentSource = "web" | "whatsapp";

/** Web chat can switch tone; WhatsApp stays concise unless overridden. */
export type ExpenseAgentResponseStyle = "concise" | "conversational";

function toneAndFollowUpBlock(style: ExpenseAgentResponseStyle): string {
  if (style === "conversational") {
    return `Estilo de respuesta:
- Español rioplatense, tono conversacional: podés saludar si el usuario saluda; cierres breves si cierra el tema ("listo", "gracias").
- Extensión según la consulta: pedidos concretos → respuesta corta con los datos; preguntas abiertas o "explicame" → podés usar un párrafo corto o viñetas sin ser verboso.
- Seguí siendo preciso: no inventes montos, fechas ni ids; números en formato simple (USD 120.50, ARS 1.500); mes como YYYY-MM cuando haga falta.
- Markdown cuando sume (listas, **negritas** en totales); emojis con moderación.

Siguiente paso (flexible):
- Si aporta, ofrecé un siguiente paso o una pregunta corta; si el usuario solo charla o ya cerró, no insistas.`;
  }

  return `Estilo de respuesta:
- Directo y al grano. Sin saludos, sin cierres ("avisame", "espero que te sirva", etc.), sin repetir lo que dijo el usuario.
- Lo más corto posible: 1–2 oraciones o una lista. Solo los datos clave (montos, mes, banco). Sin explicaciones de qué es cada métrica salvo que las pidan.
- Numeros en formato simple (USD 120.50, ARS 1.500). Mes en formato YYYY-MM cuando hace falta nombrarlo.
- Markdown solo cuando suma (listas para varios ítems, **negrita** para totales). No abuses de emojis.

Acción siguiente (importante):
- Después de cada respuesta, sugerí el próximo paso útil con una pregunta o opciones cortas (p. ej. "¿Lo marco como pagado?", "¿Querés que agregue X al mes?", "¿Lo cargo en Visa o en Galicia?").
- Solo NO sugerís nada si el usuario cierra con "listo", "gracias", "ok", "nada más" o similares: ahí respondés con un cierre mínimo (p. ej. "Listo." o "👍") y nada más.`;
}

function activeMonthUiBlock(activeMonth: string): string {
  return `

Contexto de UI:
- El usuario tiene abierto el mes ${activeMonth} (yyyy-MM) en esta pantalla. Preferí ese mes cuando la consulta sea ambigua salvo que pida otro explícitamente.`;
}

function buildSystemPrompt(
  userImportInstructions?: string | null,
  options?: {
    responseStyle?: ExpenseAgentResponseStyle;
    activeMonth?: string | null;
  },
) {
  const responseStyle = options?.responseStyle ?? "concise";
  const activeMonth =
    options?.activeMonth && /^\d{4}-\d{2}$/.test(options.activeMonth.trim()) ?
      options.activeMonth.trim()
    : null;

  const personal =
    userImportInstructions?.trim() ?
      `

Instrucciones personales del usuario (prioridad alta al interpretar movimientos del banco, importaciones Revolut, fotos de movimientos y categorías):
"""
${userImportInstructions.trim()}
"""
Aplicá estas reglas al sugerir categorías, al decidir qué registrar como gasto del mes y al conciliar. Si una regla choca con un dato concreto del movimiento, explicá brevemente la decisión.`
    : "";

  return `Sos el asistente de gastos de eTracker. Hablás en español rioplatense.

${toneAndFollowUpBlock(responseStyle)}

Contexto del producto:
- "balance" del mes = ingreso del mes − total planificado (lo libre después de comprometer todos los gastos).
- "totals.remaining" = planificado − pagado (lo que falta desembolsar de lo ya planeado).
- "Plantilla" (Expense) = gasto que se aplica a uno o varios meses; cada mes tiene su "línea" (MonthExpenseLine) que se marca como pagada.
- Mes en curso (UTC): ${getCurrentMonthKey()}. addMonthLine **solo** funciona para el mes en curso.
- Categorías: ${expenseCategoryOptions.join(", ")}. Si dudás, OTROS.

Reglas de uso de tools:
- No inventes ids ni montos. Si falta info, pedí solo el dato que falta (una pregunta por turno).
- Si el usuario nombra un banco, resolvé el id con listBanks.
- Si quiere que una preferencia quede guardada para futuras sesiones (reglas de Revolut/importaciones, categorías por defecto, marcar importaciones como pagadas, etc.), llamá updateExpenseImportInstructions; también puede editarlo en Configuración de la app.
- "Cuánto me queda / cómo voy" → getMonthState con el mes pedido o el actual.
- Imagen (Revolut, captura del banco, ticket): extraé las transacciones, mostralas en una lista compacta agrupadas por banco y pedí confirmación antes de aplicar nada. Para cada movimiento elegí updateMonthLine (si ya existe una línea similar) o addMonthLine (movimiento nuevo).
- CSV / extracto en texto: a veces el usuario pega o adjunta un CSV ya convertido a lista en el mensaje (fechas, descripciones, importes). Tratalo como movimientos del banco: misma regla que una imagen — lista compacta, respetá las instrucciones personales del usuario sobre qué ignorar o cómo categorizar, y pedí confirmación antes de usar tools.
- PDF: el mensaje puede traer texto extraído y/o imágenes de página (PDF escaneado). Si hay imágenes, leé los movimientos como con una captura del banco: lista compacta, pedí confirmación antes de aplicar cambios.

Gráficos (renderChart):
- Cuando un visual aporta más que una lista, llamá renderChart DESPUÉS de obtener los datos (nunca con números inventados).
- Casos típicos:
  · "ingreso vs gastos del mes" → bar con xValues=["Ingreso","Planificado","Pagado","Restante","Balance"] y una sola serie.
  · "distribución por categoría" o "por banco" → pie con slices=[{name, value}, ...].
  · "evolución por mes" → line o area con xValues = meses (yyyy-MM) y una serie por métrica.
  · "comparar bancos en planificado vs pagado" → bar con dos series.
- Pasá 'currency' (USD/ARS) cuando los valores son montos del usuario.
- Tras emitir el gráfico, agregá UNA frase corta con la conclusión (p. ej. "Restante a pagar: USD 320") y, si corresponde, una sugerencia de siguiente paso.${activeMonth ? activeMonthUiBlock(activeMonth) : ""}${personal}`;
}

export type ExpenseAgentMessages = Array<ModelMessage>;

/**
 * Stream the agent for the in-app chat (used by /api/chat with useChat).
 */
export async function streamExpenseAgent({
  userId,
  messages,
  source = "web",
  responseStyle = "concise",
  activeMonth,
}: {
  userId: string;
  messages: ExpenseAgentMessages;
  source?: AgentSource;
  responseStyle?: ExpenseAgentResponseStyle;
  activeMonth?: string | null;
}) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { expenseImportInstructions: true },
  });

  const traceId = newTraceId();
  const startedAt = Date.now();
  logAIRequest({ traceId, source, userId, model: DEFAULT_MODEL, messages });

  return streamText({
    maxRetries: OPENAI_CHAT_MAX_RETRIES,
    model: expenseAgentOpenAi(DEFAULT_MODEL),
    system: buildSystemPrompt(user?.expenseImportInstructions ?? null, {
      responseStyle,
      activeMonth,
    }),
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
  responseStyle = "concise",
}: {
  userId: string;
  messages: ExpenseAgentMessages;
  source?: AgentSource;
  responseStyle?: ExpenseAgentResponseStyle;
}): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { expenseImportInstructions: true },
  });

  const traceId = newTraceId();
  const startedAt = Date.now();
  logAIRequest({ traceId, source, userId, model: DEFAULT_MODEL, messages });

  const result = await generateText({
    maxRetries: OPENAI_CHAT_MAX_RETRIES,
    model: expenseAgentOpenAi(DEFAULT_MODEL),
    system: buildSystemPrompt(user?.expenseImportInstructions ?? null, {
      responseStyle,
    }),
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
