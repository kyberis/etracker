import { gateway, generateText } from "ai";

import { db } from "@/lib/db";
import { log } from "@/lib/log";

/**
 * AI-generated welcome flow for first-time users.
 *
 * Runs once per user: the agent produces a friendly rioplatense greeting
 * explaining what Clara does, and we persist `welcomedAt` so subsequent
 * visits don't re-trigger the call. Failures fall back to a static message
 * AND still mark the user as welcomed — better one missed personalization
 * than an infinite retry loop on every chat visit.
 */

const WELCOME_MODEL =
  process.env.AI_MODEL ?? process.env.OPENAI_MODEL ?? "openai/gpt-5.4";

const STATIC_FALLBACK = `¡Bienvenido/a a Clara! 👋

Soy tu asistente financiera personal. Te ayudo a planificar gastos fijos y puntuales, llevar registro de en qué se te va la plata, ver cuánto te sobra al final del mes y darte recomendaciones para tener una vida financiera más ordenada (sin sermones, prometido).

Antes de arrancar, contame: ¿en qué moneda querés ver tus totales y balance? (USD, ARS, EUR, etc.). Después podés contarme tus ingresos del mes, o tirarme una captura del banco, un CSV de Revolut o un PDF para cargar gastos.`;

const WELCOME_SYSTEM_PROMPT = `Sos Clara, una asistente financiera con IA, dándole la bienvenida a un usuario que recién se registró.

Tono:
- Español rioplatense, amistoso, medio informal pero serio. Como una amiga contadora que sabe lo que hace.
- Podés tirar algún comentario chistoso pero con respeto (sin pasarte de graciosa). Ejemplo de referencia del estilo que se busca: "buenos días, a ver si hoy podemos sacarle más jugo a tus ingresos ya que venís lento, ¿en qué gastaste hoy? ¿o acaso recibiste platita?".
- Usá vos / decime / contame. Evitá tuteo o español neutro.

Qué tenés que decirle (sin sonar a checklist; integrarlo en una bienvenida natural):
1. Saludo cálido y breve presentación como Clara.
2. Para qué sirve Clara: planificar gastos fijos y puntuales mes a mes, saber en qué se va la plata, llevar tracking de cuánto sobra al cierre del mes, y dar recomendaciones para ordenar las finanzas y conseguir objetivos.
3. **Importante**: preguntale cuál es su moneda principal (USD, ARS, EUR, etc.). Aclará que los gastos pueden cargarse en cualquier moneda y nosotros convertimos a la principal automáticamente, pero las matemáticas siempre se reportan en la principal.
4. Invitación concreta para arrancar: pedile que cuente sus ingresos del mes, o que cargue el primer gasto, o que adjunte una captura del banco / CSV de Revolut / PDF para que vos lo proceses.

Formato:
- 3 a 5 oraciones, máximo 6.
- Markdown ligero está bien (alguna **negrita** o lista corta si suma). Emojis con moderación (uno o dos como mucho).
- Cerrá con UNA pregunta corta para empujar la conversación.
- No inventes datos del usuario (no sabés su nombre, ingreso, banco, nada). Hablá en general.`;

export type WelcomeResult = {
  /** The text to render as the first assistant message, or `null` if the user was already welcomed. */
  text: string | null;
};

async function generateWelcomeMessage(userId: string): Promise<string> {
  const result = await generateText({
    model: gateway(WELCOME_MODEL),
    providerOptions: {
      gateway: {
        user: userId,
        tags: ["feature:welcome"],
      },
    },
    system: WELCOME_SYSTEM_PROMPT,
    prompt:
      "Saludá al usuario que recién se registró siguiendo el tono y las instrucciones del system prompt.",
    maxRetries: 2,
  });

  const text = result.text.trim();
  if (!text) throw new Error("Welcome generation returned empty text");
  return text;
}

/**
 * Returns the welcome text for a user that hasn't been greeted yet, or `null`
 * if `welcomedAt` is already set. Always marks the user as welcomed so this
 * runs at most once per account.
 */
export async function getOrCreateWelcome(userId: string): Promise<WelcomeResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { welcomedAt: true },
  });

  if (!user) return { text: null };
  if (user.welcomedAt !== null) return { text: null };

  const aiConfigured =
    !!process.env.AI_GATEWAY_API_KEY ||
    !!process.env.VERCEL_OIDC_TOKEN ||
    !!process.env.OPENAI_API_KEY;

  let text = STATIC_FALLBACK;
  if (aiConfigured) {
    try {
      text = await generateWelcomeMessage(userId);
    } catch (error) {
      log.warn("welcome.generation_failed", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      text = STATIC_FALLBACK;
    }
  }

  // Mark as welcomed regardless of AI success — prevents retry loops on every visit.
  await db.user.update({
    where: { id: userId },
    data: { welcomedAt: new Date() },
  });

  return { text };
}
