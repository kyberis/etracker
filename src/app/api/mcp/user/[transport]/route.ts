import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { verifyBearerToken } from "@/lib/api-token";
import { registerUserMcp } from "@/lib/mcp/user-server";

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
 *     "ada": {
 *       "url": "https://ada.trefolio.com/api/mcp/user",
 *       "headers": { "Authorization": "Bearer ada_pat_..." }
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
      name: "ada-user",
      version: "0.1.0",
    },
  },
  {
    basePath: "/api/mcp",
    maxDuration: 60,
    verboseLogs: process.env.NODE_ENV !== "production",
  },
);

const handler = withMcpAuth(
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

export { handler as GET, handler as POST, handler as DELETE };

export const dynamic = "force-dynamic";
