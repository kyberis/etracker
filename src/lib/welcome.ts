import { gateway, generateText } from "ai";

import { db } from "@/lib/db";
import { isLocale, type Locale } from "@/lib/i18n/locale";
import { log } from "@/lib/log";

/**
 * AI-generated welcome flow for first-time users.
 *
 * Runs once per user: the agent produces a friendly locale-aware greeting
 * explaining what Clara does, and we persist `welcomedAt` so subsequent
 * visits don't re-trigger the call. Failures fall back to a static message
 * AND still mark the user as welcomed — better one missed personalization
 * than an infinite retry loop on every chat visit.
 */

const WELCOME_MODEL =
  process.env.AI_MODEL ?? process.env.OPENAI_MODEL ?? "openai/gpt-5.4";

const STATIC_FALLBACK_ES = `¡Bienvenido/a a Clara! 👋

Soy tu asistente financiera personal. Te ayudo a planificar gastos fijos y puntuales, llevar registro de en qué se te va la plata, ver cuánto te sobra al final del mes y darte recomendaciones para tener una vida financiera más ordenada (sin sermones, prometido).

Antes de arrancar, contame: ¿en qué moneda querés ver tus totales y balance? (USD, ARS, EUR, etc.). Después podés contarme tus ingresos del mes, o tirarme una captura del banco, un CSV de Revolut o un PDF para cargar gastos.`;

const STATIC_FALLBACK_EN = `Welcome to Clara! 👋

I'm your personal financial assistant. I'll help you plan recurring and one-off expenses, track where your money goes, see what's left at the end of the month and give you recommendations to keep your finances tidy (no lectures, promised).

Before we start: which currency do you want totals and balance reported in? (USD, ARS, EUR, etc.). After that you can tell me about your monthly income, or send me a bank screenshot, a Revolut CSV or a PDF to log expenses.`;

const WELCOME_SYSTEM_PROMPT_ES = `Sos Clara, una asistente financiera con IA, dándole la bienvenida a un usuario que recién se registró.

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

const WELCOME_SYSTEM_PROMPT_EN = `You are Clara, an AI financial assistant, welcoming a user who just signed up.

Tone:
- Neutral conversational English, friendly and a bit informal but professional. Like an accountant friend who knows what she's doing.
- You can drop a tiny bit of humor but with respect (don't try too hard).
- Avoid corporate/formal English.

What you must cover (no checklist feel; weave it into a natural welcome):
1. Warm greeting and short self-introduction as Clara.
2. What Clara is for: planning recurring and one-off expenses month by month, understanding where money goes, tracking how much is left at month close, and giving recommendations to keep finances tidy and reach goals.
3. **Important**: ask the user for their primary currency (USD, ARS, EUR, etc.). Clarify that individual expenses can be in any currency and we convert to the primary automatically, but math is always reported in the primary.
4. Concrete invitation to start: ask them to share their monthly income, log the first expense, or attach a bank screenshot / Revolut CSV / PDF for you to process.

Format:
- 3 to 5 sentences, max 6.
- Light markdown is fine (some **bold** or a short list if useful). Emojis sparingly (one or two max).
- Close with ONE short question to keep the conversation going.
- Don't invent user data (you don't know their name, income, bank, nothing). Speak in general terms.`;

export type WelcomeResult = {
  /** The text to render as the first assistant message, or `null` if the user was already welcomed. */
  text: string | null;
};

async function generateWelcomeMessage(
  userId: string,
  locale: Locale,
): Promise<string> {
  const result = await generateText({
    model: gateway(WELCOME_MODEL),
    providerOptions: {
      gateway: {
        user: userId,
        tags: ["feature:welcome", `locale:${locale}`],
      },
    },
    system: locale === "en" ? WELCOME_SYSTEM_PROMPT_EN : WELCOME_SYSTEM_PROMPT_ES,
    prompt:
      locale === "en"
        ? "Greet the user who just signed up, following the tone and instructions in the system prompt."
        : "Saludá al usuario que recién se registró siguiendo el tono y las instrucciones del system prompt.",
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
    select: { welcomedAt: true, locale: true },
  });

  if (!user) return { text: null };
  if (user.welcomedAt !== null) return { text: null };

  const locale: Locale = isLocale(user.locale) ? user.locale : "es";

  const aiConfigured =
    !!process.env.AI_GATEWAY_API_KEY ||
    !!process.env.VERCEL_OIDC_TOKEN ||
    !!process.env.OPENAI_API_KEY;

  let text = locale === "en" ? STATIC_FALLBACK_EN : STATIC_FALLBACK_ES;
  if (aiConfigured) {
    try {
      text = await generateWelcomeMessage(userId, locale);
    } catch (error) {
      log.warn("welcome.generation_failed", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      text = locale === "en" ? STATIC_FALLBACK_EN : STATIC_FALLBACK_ES;
    }
  }

  // Mark as welcomed regardless of AI success — prevents retry loops on every visit.
  await db.user.update({
    where: { id: userId },
    data: { welcomedAt: new Date() },
  });

  return { text };
}
