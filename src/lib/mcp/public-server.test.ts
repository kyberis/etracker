import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";

import { registerPublicMcp } from "./public-server";

/**
 * Spin up an in-memory MCP server, register the public toolset, and inspect
 * the resulting registry through the public-facing list endpoints. We don't
 * connect a transport — we hit the SDK's listing/handler functions directly.
 */
async function buildServer() {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerPublicMcp(server);
  return server;
}

describe("public MCP server", () => {
  it("registers the documented tools", async () => {
    const server = await buildServer();
    // The McpServer keeps registered tools in a private map; the public way
    // to enumerate them is to send a tools/list request, but for this unit
    // test we lean on the underlying private state via type assertion.
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    for (const name of [
      "getOverview",
      "getFeatures",
      "getFaq",
      "getChangelog",
      "searchDocs",
    ]) {
      expect(tools[name]).toBeDefined();
    }
  });

  it("registers the documented resources and prompts", async () => {
    const server = await buildServer();
    const resources = (
      server as unknown as { _registeredResources: Record<string, unknown> }
    )._registeredResources;
    const prompts = (
      server as unknown as { _registeredPrompts: Record<string, unknown> }
    )._registeredPrompts;
    for (const uri of [
      "clara://about",
      "clara://features",
      "clara://faq",
      "clara://privacy",
      "clara://changelog",
    ]) {
      expect(resources[uri]).toBeDefined();
    }
    for (const name of ["pitch", "compareWithCompetitors", "howClaraWorks"]) {
      expect(prompts[name]).toBeDefined();
    }
  });
});
