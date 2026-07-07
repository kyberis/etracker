import { describe, it, expect } from "vitest";

import {
  hasClaraScope,
  isClaraMcpScope,
  requiredClaraScopeForTool,
  resolveEffectiveClaraScopes,
} from "@/lib/mcp/pat-scopes";

describe("clara pat-scopes", () => {
  it("recognizes finance scopes", () => {
    expect(isClaraMcpScope("finance:read")).toBe(true);
    expect(isClaraMcpScope("portfolio:read")).toBe(false);
  });

  it("maps getSavingsSummary to finance:read", () => {
    expect(requiredClaraScopeForTool("getSavingsSummary")).toBe("finance:read");
  });

  it("legacy null grants full Clara access", () => {
    expect(resolveEffectiveClaraScopes(null)).toEqual(["finance:read", "finance:write"]);
  });

  it("hasClaraScope checks membership", () => {
    expect(hasClaraScope(["finance:read"], "finance:write")).toBe(false);
    expect(hasClaraScope(["finance:read", "finance:write"], "finance:read")).toBe(true);
  });
});
