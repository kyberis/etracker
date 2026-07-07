import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { db } from "@/lib/db";
import { buildClaraOfficeSavingsSummary } from "@/lib/office/savings-summary";
import { errContent, gateClaraMcpTool, jsonContent } from "@/lib/mcp/mcp-helpers";

/** Office-style savings summary for external MCP agents (Warren / cross-app context). */
export function registerClaraSavingsSummaryTool(server: McpServer): void {
  server.registerTool(
    "getSavingsSummary",
    {
      title: "Resumen de ahorros (Office)",
      description:
        "Resumen compacto de la pila de ahorros: balance de emergencia, objetivo (3× ingreso mensual), superávit e inversión libre. Misma forma que el endpoint Office interno; no incluye movimientos del ledger (usá getSavings para eso).",
      inputSchema: {},
    },
    async (_args, extra) => {
      const gate = gateClaraMcpTool(extra, "getSavingsSummary");
      if (!gate.ok) return gate.response;

      const user = await db.user.findUnique({
        where: { id: gate.userId },
        select: {
          savings: true,
          monthlyIncome: true,
          primaryCurrency: true,
        },
      });
      if (!user) return errContent("User not found.");

      const summary = buildClaraOfficeSavingsSummary({
        id: gate.userId,
        email: "",
        idpSub: null,
        savings: user.savings,
        monthlyIncome: user.monthlyIncome,
        primaryCurrency: user.primaryCurrency,
        isActive: true,
        kind: "REGULAR",
      });
      return jsonContent(summary);
    },
  );
}
