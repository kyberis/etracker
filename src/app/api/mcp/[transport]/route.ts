import { createMcpHandler } from "mcp-handler";

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
const handler = createMcpHandler(
  (server) => {
    registerPublicMcp(server);
  },
  {
    serverInfo: {
      name: "clara-public",
      version: "0.1.0",
    },
  },
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: process.env.NODE_ENV !== "production",
  },
);

export { handler as GET, handler as POST, handler as DELETE };

export const dynamic = "force-dynamic";
