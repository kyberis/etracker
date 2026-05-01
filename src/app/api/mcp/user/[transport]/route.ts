import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { authenticateRequest, verifyBearerToken } from "@/lib/api-token";
import { PRODUCT_VERSION } from "@/lib/marketing-content";
import { registerUserMcp } from "@/lib/mcp/user-server";
import { limitByIp, limitByUser } from "@/lib/rate-limit";

/**
 * Per-user MCP server. Authenticated via bearer tokens that the user
 * generates from `/settings → Acceso para AI (MCP)`.
 *
 * Each tool reads the authenticated user id off `extra.authInfo.extra.userId`
 * (set below by the bearer-token verifier) so we never trust client-supplied
 * ids and a token from user A cannot ever read user B's data.
 *
 * Example client config (Claude Desktop / Cursor):
 *
 * ```json
 * {
 *   "mcpServers": {
 *     "clara": {
 *       "url": "https://clara.trefolio.com/api/mcp/user",
 *       "headers": { "Authorization": "Bearer clara_pat_..." }
 *     }
 *   }
 * }
 * ```
 */
const baseHandler = createMcpHandler(
  (server) => {
    registerUserMcp(server);
  },
  {
    serverInfo: {
      name: "clara-user",
      version: PRODUCT_VERSION,
    },
  },
  {
    basePath: "/api/mcp",
    maxDuration: 60,
    verboseLogs: process.env.NODE_ENV !== "production",
  },
);

const authenticatedHandler = withMcpAuth(
  baseHandler,
  async (_req, bearer) => {
    if (!bearer) return undefined;
    const auth = await verifyBearerToken(bearer);
    if (!auth) return undefined;
    return {
      token: bearer,
      clientId: auth.tokenId,
      scopes: ["finance:read", "finance:write"],
      extra: { userId: auth.userId, tokenId: auth.tokenId },
    };
  },
  { required: true },
);

/**
 * Per-user MCP rate limit: 240 requests / minute / user. Generous enough that
 * a normal Claude Desktop session never hits it, low enough that a leaked or
 * shared PAT can't quietly burn through OpenAI/AI Gateway quota.
 *
 * IP-level cap on top blocks anonymous bursts (no token / wrong token) so a
 * single attacker can't probe forever for a valid hash.
 */
const PER_USER_MCP_LIMIT = 240;
const PER_IP_UNAUTH_LIMIT = 60;

async function rateLimitedHandler(
  request: Request,
  context: unknown,
): Promise<Response> {
  const auth = await authenticateRequest(request);
  if (auth) {
    const userLimit = await limitByUser(
      "mcp.user",
      auth.userId,
      PER_USER_MCP_LIMIT,
      "1 m",
      "MCP rate limit reached. Try again in a moment.",
    );
    if (!userLimit.ok) return userLimit.response;
  } else {
    const ipLimit = await limitByIp(
      request,
      "mcp.user.unauth",
      PER_IP_UNAUTH_LIMIT,
      "1 m",
      "Too many unauthenticated MCP requests.",
    );
    if (!ipLimit.ok) return ipLimit.response;
  }
  return (authenticatedHandler as unknown as (
    req: Request,
    ctx: unknown,
  ) => Promise<Response>)(request, context);
}

export const GET = rateLimitedHandler;
export const POST = rateLimitedHandler;
export const DELETE = rateLimitedHandler;

export const dynamic = "force-dynamic";
