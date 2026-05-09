import { NextResponse } from "next/server";

import { SITE_DESCRIPTION, SITE_NAME, getSiteUrl } from "@/lib/seo";

/**
 * Discovery descriptor for Clara's MCP servers. There's no formal spec for a
 * `.well-known/mcp.json` file yet, but several emerging clients and gateways
 * look for one — we surface both the public (no-auth) and per-user (bearer)
 * endpoints with the URL, transport and auth requirements.
 */
export async function GET() {
  const site = getSiteUrl();

  const body = {
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    homepage: site,
    documentation: `${site}/llms-full.txt`,
    contact: {
      name: "Trefolio",
      url: "https://trefolio.com",
      issues: "https://github.com/kyberis/etracker/issues",
    },
    servers: [
      {
        id: "clara-public",
        name: `${SITE_NAME} (público)`,
        description:
          "Información pública sobre Clara: features, FAQ, changelog, privacy. Sin auth.",
        url: `${site}/api/mcp`,
        transport: "http",
        protocol: "modelcontextprotocol",
        version: "2025-06-18",
        authentication: { type: "none" },
        capabilities: {
          tools: true,
          resources: true,
          prompts: true,
        },
      },
      {
        id: "clara-user",
        name: `${SITE_NAME} (por usuario)`,
        description:
          "Acceso autenticado a los datos del usuario en Clara (gastos, meses, balance). Bearer `tfp_pat_…` emitido en user.trefolio.com → Developer / AI & MCP access (mismo token que Will y trefolio).",
        url: `${site}/api/mcp/user`,
        transport: "http",
        protocol: "modelcontextprotocol",
        version: "2025-06-18",
        authentication: {
          type: "bearer",
          token_format: "tfp_pat_<64-hex>",
          documentation: "https://user.trefolio.com/account/developer",
        },
        capabilities: {
          tools: true,
          resources: true,
          prompts: false,
        },
      },
    ],
  };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

export const dynamic = "force-static";
