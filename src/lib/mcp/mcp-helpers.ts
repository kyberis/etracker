import {
  DEFAULT_CLARA_MCP_SCOPES,
  hasClaraScope,
  isClaraMcpScope,
  LEGACY_CLARA_MCP_SCOPES,
  requiredClaraScopeForTool,
  type ClaraMcpScope,
} from "@/lib/mcp/pat-scopes";

export function jsonContent(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function errContent(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

export function getUserIdFromExtra(extra: { authInfo?: { extra?: Record<string, unknown> } }) {
  const userId = extra.authInfo?.extra?.userId;
  return typeof userId === "string" && userId.length > 0 ? userId : null;
}

export function getClaraScopesFromExtra(extra: {
  authInfo?: { extra?: Record<string, unknown> };
}): ClaraMcpScope[] {
  const raw = extra.authInfo?.extra?.scopes;
  if (Array.isArray(raw)) {
    const filtered = raw.filter((s): s is ClaraMcpScope => typeof s === "string" && isClaraMcpScope(s));
    if (raw.length > 0 && filtered.length === 0) return [];
    return filtered.length > 0 ? filtered : DEFAULT_CLARA_MCP_SCOPES;
  }
  return LEGACY_CLARA_MCP_SCOPES;
}

export function requireClaraMcpToolScope(
  extra: { authInfo?: { extra?: Record<string, unknown> } },
  toolName: string,
) {
  const required = requiredClaraScopeForTool(toolName);
  if (!required) return null;
  const granted = getClaraScopesFromExtra(extra);
  if (!hasClaraScope(granted, required)) {
    return errContent(
      `Forbidden: missing PAT scope "${required}" for tool ${toolName}. Add it when minting the token at user.trefolio.com → Developer.`,
    );
  }
  return null;
}

type McpToolError = ReturnType<typeof errContent>;

export function gateClaraMcpTool(
  extra: { authInfo?: { extra?: Record<string, unknown> } },
  toolName: string,
): { ok: true; userId: string } | { ok: false; response: McpToolError } {
  const userId = getUserIdFromExtra(extra);
  if (!userId) return { ok: false, response: errContent("Unauthorized.") };
  const scopeErr = requireClaraMcpToolScope(extra, toolName);
  if (scopeErr) return { ok: false, response: scopeErr };
  return { ok: true, userId };
}
