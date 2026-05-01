import { createMcpHandler } from "mcp-handler";

import {
  isLocale,
  pickFromAcceptLanguage,
  type Locale,
} from "@/lib/i18n/locale";
import { PRODUCT_VERSION } from "@/lib/marketing-content";
import { registerPublicMcp } from "@/lib/mcp/public-server";

/**
 * Public, no-auth MCP server. Exposes Clara's marketing documentation as
 * resources, tools and prompts so any AI client (Claude Desktop, Cursor,
 * ChatGPT, etc.) can answer "what is Clara?" questions without an account.
 *
 * The handler files this `[transport]` segment to "mcp" or "sse" depending
 * on the client; both Streamable HTTP and SSE are supported by `mcp-handler`.
 *
 * Example client config (Claude Desktop / Cursor):
 *
 * ```json
 * {
 *   "mcpServers": {
 *     "clara": { "url": "https://clara.trefolio.com/api/mcp" }
 *   }
 * }
 * ```
 */
/**
 * Resolve the locale for this MCP request. Order: explicit `?lang=` query →
 * `Accept-Language` header → "es" default. Returned as a strict `Locale` so
 * the public server registers the right copy.
 */
function resolveLocale(request: Request): Locale {
  const url = new URL(request.url);
  const queryLang = url.searchParams.get("lang");
  if (queryLang && isLocale(queryLang)) return queryLang;
  return pickFromAcceptLanguage(request.headers.get("accept-language"));
}

const handlerCache = new Map<Locale, (req: Request, ctx?: unknown) => Promise<Response>>();

function getHandlerForLocale(locale: Locale) {
  let cached = handlerCache.get(locale);
  if (cached) return cached;
  const handler = createMcpHandler(
    (server) => {
      registerPublicMcp(server, locale);
    },
    {
      serverInfo: {
        name: "clara-public",
        version: PRODUCT_VERSION,
      },
    },
    {
      basePath: "/api",
      maxDuration: 60,
      verboseLogs: process.env.NODE_ENV !== "production",
    },
  );
  cached = handler as unknown as (req: Request, ctx?: unknown) => Promise<Response>;
  handlerCache.set(locale, cached);
  return cached;
}

async function dispatch(request: Request, context: unknown): Promise<Response> {
  const locale = resolveLocale(request);
  const handler = getHandlerForLocale(locale);
  return handler(request, context);
}

export const GET = dispatch;
export const POST = dispatch;
export const DELETE = dispatch;

export const dynamic = "force-dynamic";
