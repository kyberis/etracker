/** Clara MCP PAT scopes — keep in sync with external/accounts/src/lib/pat-scopes.ts */
export const CLARA_MCP_SCOPE_IDS = ["finance:read", "finance:write"] as const;

export type ClaraMcpScope = (typeof CLARA_MCP_SCOPE_IDS)[number];

export const DEFAULT_CLARA_MCP_SCOPES: ClaraMcpScope[] = ["finance:read"];

/** Legacy ecosystem tokens (null scopes_json on IdP) include Clara scopes. */
export const LEGACY_CLARA_MCP_SCOPES: ClaraMcpScope[] = [...CLARA_MCP_SCOPE_IDS];

export function isClaraMcpScope(value: string): value is ClaraMcpScope {
  return (CLARA_MCP_SCOPE_IDS as readonly string[]).includes(value);
}

export function resolveEffectiveClaraScopes(stored: readonly string[] | null | undefined): ClaraMcpScope[] {
  if (stored == null) return LEGACY_CLARA_MCP_SCOPES;
  const filtered = stored.filter((s): s is ClaraMcpScope => isClaraMcpScope(s));
  return filtered.length > 0 ? filtered : DEFAULT_CLARA_MCP_SCOPES;
}

export function hasClaraScope(granted: readonly string[], required: ClaraMcpScope): boolean {
  return granted.includes(required);
}

/** Required scope per MCP tool name (Clara subset). */
export const CLARA_MCP_TOOL_REQUIRED_SCOPE: Record<string, ClaraMcpScope> = {
  getSavingsSummary: "finance:read",
  getSavings: "finance:read",
  addSavingsMovement: "finance:write",
};

export function requiredClaraScopeForTool(toolName: string): ClaraMcpScope | undefined {
  return CLARA_MCP_TOOL_REQUIRED_SCOPE[toolName];
}
