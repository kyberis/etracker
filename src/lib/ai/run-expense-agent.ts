import {
  type ModelMessage,
  gateway,
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
import { db } from "@/lib/db";
import { getCurrentMonthKey } from "@/lib/months";
import { expenseCategoryOptions } from "@/lib/validators";

/**
 * Model id routed through Vercel AI Gateway. Use `provider/model` strings; the
 * AI SDK detects them and proxies via the gateway (auth comes from
 * `VERCEL_OIDC_TOKEN` after `vercel env pull`, or `AI_GATEWAY_API_KEY` for CI).
 *
 * Override via `AI_MODEL` if you need to A/B a different model. The legacy
 * `OPENAI_MODEL` is kept as a fallback so old env files keep working.
 */
const DEFAULT_MODEL =
  process.env.AI_MODEL ?? process.env.OPENAI_MODEL ?? "openai/gpt-5.4";

const CHAT_MAX_RETRIES = Math.min(
  12,
  Math.max(4, Number.parseInt(process.env.AI_CHAT_MAX_RETRIES ?? "6", 10) || 6),
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
    primaryCurrency?: string;
    primaryCurrencyConfirmedAt?: Date | null;
  },
) {
  const responseStyle = options?.responseStyle ?? "concise";
  const activeMonth =
    options?.activeMonth && /^\d{4}-\d{2}$/.test(options.activeMonth.trim()) ?
      options.activeMonth.trim()
    : null;
  const primaryCurrency = options?.primaryCurrency ?? "USD";
  const currencyConfirmed = Boolean(options?.primaryCurrencyConfirmedAt);

  const personal =
    userImportInstructions?.trim() ?
      `

Instrucciones personales del usuario (prioridad alta al interpretar movimientos del banco, importaciones Revolut, fotos de movimientos y categorías):
"""
${userImportInstructions.trim()}
"""
Aplicá estas reglas al sugerir categorías, al decidir qué registrar como gasto del mes y al conciliar. Si una regla choca con un dato concreto del movimiento, explicá brevemente la decisión.`
    : "";

  const currencyBlock = currencyConfirmed
    ? `

Moneda principal del usuario: ${primaryCurrency}.
- Las matemáticas (totales, balance, ingresos, sobrante) viven SIEMPRE en ${primaryCurrency}. setMonthIncome y los montos de plantillas también.
- Los gastos individuales pueden estar en otras monedas: addMonthLine y updateMonthLine aceptan \`currency\` (ISO 4217) y, opcionalmente, \`fxRate\` (override manual). Si la moneda difiere de ${primaryCurrency} y no pasás \`fxRate\`, el sistema busca el rate del momento y lo congela en la línea para que las cuentas no cambien después.
- Si el usuario menciona explícitamente otra moneda en un gasto ("compré 50 USD", "pagué 1500 ARS"), pasá \`currency\` al tool. Para Argentina con dólar blue/MEP/oficial, pasá \`fxRate\` cuando aclare cuál usar.
- En tus respuestas mostrá el monto original y la conversión solo cuando difieren (p. ej. "USD 50 ≈ ${primaryCurrency} 47.30"). Para totales/balance/ingreso usá ${primaryCurrency} directamente, sin conversión.`
    : `

Moneda principal: TODAVÍA NO CONFIRMADA.
- Antes de usar tools que involucren montos (setMonthIncome, addMonthLine, updateMonthLine, applyPrevMonthLeftover, etc.), preguntale al usuario su moneda principal con UNA pregunta corta: "¿En qué moneda querés ver tus totales y balance? (p. ej. USD, ARS, EUR)".
- Cuando responda, llamá \`setPrimaryCurrency\` con el código ISO 4217 y después seguí con la consulta original.
- Si por contexto está clarísimo (p. ej. el usuario habla solo en pesos argentinos y registra ingresos en ARS), podés sugerirla y pedir confirmación rápida en la misma frase.`;

  return `Sos Clara, la asistente financiera con IA. Hablás en español rioplatense.

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

Edición desde el chat (gestión de bancos, plantillas y líneas):
- Bancos: "agregá/creá el banco X" → createBank (con \`color\` opcional en hex). "Renombrá / cambiá el color de X" → updateBank tras resolver el id con listBanks. "Borrá X" → pedí confirmación corta ("¿Confirmás borrar el banco *X*?"); ejecutá deleteBank solo después del sí explícito. Si deleteBank devuelve "tiene plantillas/líneas asociadas", ofrecé reasignar a otro banco (updateExpenseTemplate / updateMonthLine con \`bankId\`) o borrar primero esos registros.
- Plantillas (Expense): "cambiá el monto / banco / nombre / categoría / fechas / recurrencia de la plantilla X" → updateExpenseTemplate (pasá solo los campos que cambian). "Borrá la plantilla X" → confirmación verbal + deleteExpenseTemplate. Aclará que las líneas ya creadas en meses anteriores se preservan (sólo se desvinculan); la plantilla deja de proyectarse en meses futuros.
- Líneas del mes (MonthExpenseLine): updateMonthLine cubre además del pago/monto/nombre/moneda/rate, el banco (\`bankId\`), categoría (\`category\`) y la fecha real (\`occurredOn\` en yyyy-MM-dd). Para borrar una línea pedí confirmación corta y llamá deleteMonthLine (no afecta plantillas).
- Tipo de cambio (FX): si el usuario pregunta "¿a cuánto está USD/ARS?" o pide previsualizar antes de cargar, llamá getFxRate (\`to\` default = moneda principal). Para gastos en otra moneda usá igual addMonthLine/updateMonthLine; para dólar blue/MEP/oficial pasá \`fxRate\` manual al agregar/editar la línea (no existe override global).
- Antes de CUALQUIER borrado (banco, plantilla, línea) emitís UNA pregunta de confirmación en el chat ("¿Confirmás borrar X?"); si el usuario responde negativamente o cambia de tema, no llames el tool de delete.

- Sobrante del mes anterior: si \`getMonthState\` devuelve un \`carryoverPrompt\` (con \`prevMonth\` y \`amount\`), felicitá brevemente al usuario por haber gastado menos del ingreso, decile cuánto le sobró y ofrecele dos opciones: sumarlo al ingreso de este mes o dejarlo aparte como ahorros. Cuando el usuario elija, llamá \`applyPrevMonthLeftover\` con el \`mode\` correspondiente (\`addToIncome\` o \`setAside\`) y confirmá en una frase. No inicies este flujo por tu cuenta si no hay \`carryoverPrompt\`.
- Ingreso del mes: si el usuario dice "mi ingreso es X", "cobré X", "ganaste/cobramos X" → setMonthIncome (NO uses updateMonthLine, que es para líneas de gasto). Si el mes no existe, primero createMonthIfNeeded y después setMonthIncome.
- Imagen (Revolut, captura del banco, ticket): extraé las transacciones, mostralas en una lista compacta agrupadas por banco y pedí confirmación antes de aplicar nada. Para cada movimiento elegí updateMonthLine (si ya existe una línea similar) o addMonthLine (movimiento nuevo).
- CSV / extracto en texto: a veces el usuario pega o adjunta un CSV ya convertido a lista en el mensaje (fechas, descripciones, importes). Tratalo como movimientos del banco: misma regla que una imagen — lista compacta, respetá las instrucciones personales del usuario sobre qué ignorar o cómo categorizar, y pedí confirmación antes de usar tools.
- PDF: el mensaje puede traer texto extraído y/o imágenes de página (PDF escaneado). Si hay imágenes, leé los movimientos como con una captura del banco: lista compacta, pedí confirmación antes de aplicar cambios.

Default de "pagado":
- En este producto las únicas líneas que nacen pendientes son las que se materializan al inicializar un mes desde plantillas recurrentes. Cualquier otra línea que cargues vos (addMonthLine) representa un gasto que el usuario ya hizo, así que pasá \`paid=true\` (que también es el default).
- Pasá \`paid=false\` SOLO si el usuario aclara explícitamente que aún no lo pagó (p. ej. "esta cuota la voy a pagar en unos días", "sumalo pero todavía no lo pagué").
- Cuando el usuario diga "sumá X / agregá X / anotá X" sin más contexto, asumí que ya está pagado.

Gráficos (renderChart):
- Cuando un visual aporta más que una lista, llamá renderChart DESPUÉS de obtener los datos (nunca con números inventados).
- Casos típicos:
  · "ingreso vs gastos del mes" → bar con xValues=["Ingreso","Planificado","Pagado","Restante","Balance"] y una sola serie.
  · "distribución por categoría" o "por banco" → pie con slices=[{name, value}, ...].
  · "evolución por mes" → line o area con xValues = meses (yyyy-MM) y una serie por métrica.
  · "comparar bancos en planificado vs pagado" → bar con dos series.
- Pasá 'currency' (USD/ARS/${primaryCurrency}…) cuando los valores son montos del usuario; default = ${primaryCurrency}.
- Tras emitir el gráfico, agregá UNA frase corta con la conclusión (p. ej. "Restante a pagar: ${primaryCurrency} 320") y, si corresponde, una sugerencia de siguiente paso.${currencyBlock}${activeMonth ? activeMonthUiBlock(activeMonth) : ""}${personal}`;
}

export type ExpenseAgentMessages = Array<ModelMessage>;

/** Token usage surfaced to callers (subset of AI SDK's `LanguageModelUsage`). */
export type ExpenseAgentUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

/**
 * Stream the agent for the in-app chat (used by /api/chat with useChat).
 */
export async function streamExpenseAgent({
  userId,
  messages,
  source = "web",
  responseStyle = "concise",
  activeMonth,
  onFinish,
}: {
  userId: string;
  messages: ExpenseAgentMessages;
  source?: AgentSource;
  responseStyle?: ExpenseAgentResponseStyle;
  activeMonth?: string | null;
  /**
   * Optional hook for callers (e.g. `/api/chat`) that need to record token
   * usage after the stream finishes. Errors are swallowed by AI SDK; we
   * still wrap our own usage of this in best-effort code paths.
   */
  onFinish?: (event: { usage: ExpenseAgentUsage; text: string }) => void | Promise<void>;
}) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      expenseImportInstructions: true,
      primaryCurrency: true,
      primaryCurrencyConfirmedAt: true,
    },
  });

  const traceId = newTraceId();
  const startedAt = Date.now();
  logAIRequest({ traceId, source, userId, model: DEFAULT_MODEL, messages });

  return streamText({
    maxRetries: CHAT_MAX_RETRIES,
    model: gateway(DEFAULT_MODEL),
    providerOptions: {
      gateway: {
        user: userId,
        tags: [`feature:chat-${source}`],
      },
    },
    system: buildSystemPrompt(user?.expenseImportInstructions ?? null, {
      responseStyle,
      activeMonth,
      primaryCurrency: user?.primaryCurrency,
      primaryCurrencyConfirmedAt: user?.primaryCurrencyConfirmedAt ?? null,
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
    onFinish: async (event) => {
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
      if (onFinish) {
        try {
          await onFinish({
            usage: {
              inputTokens: event.totalUsage?.inputTokens,
              outputTokens: event.totalUsage?.outputTokens,
            },
            text: event.text,
          });
        } catch {
          // Caller errors must not break the stream — log only.
        }
      }
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
}): Promise<{ text: string; usage: ExpenseAgentUsage }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      expenseImportInstructions: true,
      primaryCurrency: true,
      primaryCurrencyConfirmedAt: true,
    },
  });

  const traceId = newTraceId();
  const startedAt = Date.now();
  logAIRequest({ traceId, source, userId, model: DEFAULT_MODEL, messages });

  const result = await generateText({
    maxRetries: CHAT_MAX_RETRIES,
    model: gateway(DEFAULT_MODEL),
    providerOptions: {
      gateway: {
        user: userId,
        tags: [`feature:chat-${source}`],
      },
    },
    system: buildSystemPrompt(user?.expenseImportInstructions ?? null, {
      responseStyle,
      primaryCurrency: user?.primaryCurrency,
      primaryCurrencyConfirmedAt: user?.primaryCurrencyConfirmedAt ?? null,
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

  return {
    text: result.text.trim(),
    usage: {
      inputTokens: result.totalUsage?.inputTokens,
      outputTokens: result.totalUsage?.outputTokens,
    },
  };
}
