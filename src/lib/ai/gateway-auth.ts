/**
 * Vercel AI Gateway — same base URL and auth order as trefolio/Clara chat.
 * @see https://vercel.com/docs/ai-gateway
 */
export const VERCEL_AI_GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1";

/** Raw bearer token for OpenAI-compatible endpoints (chat, audio, …) via the gateway. */
export function resolveGatewayApiKeyFromEnv(): string | null {
  return (
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    null
  );
}
