import { NextResponse } from "next/server";

import {
  SITE_DESCRIPTION,
  SITE_NAME,
  getSiteUrl,
} from "@/lib/seo";

/**
 * Minimal OpenAPI schema for the public surface that AI clients (ChatGPT
 * custom GPTs, plugin aggregators, etc.) can call without authentication.
 * The MCP servers (`/api/mcp` and `/api/mcp/user`) are the preferred
 * integration path; this file is purely for compatibility with non-MCP
 * tooling.
 */
export async function GET() {
  const site = getSiteUrl();

  const schema = {
    openapi: "3.1.0",
    info: {
      title: `${SITE_NAME} Public API`,
      version: "0.1.0",
      description: SITE_DESCRIPTION,
      contact: { name: "Trefolio", url: "https://trefolio.com" },
      license: { name: "MIT", url: "https://opensource.org/licenses/MIT" },
    },
    servers: [{ url: site }],
    paths: {
      "/llms.txt": {
        get: {
          operationId: "getLlmsTxt",
          summary: "Resumen estructurado para LLMs (formato llmstxt.org).",
          responses: {
            "200": {
              description: "OK",
              content: { "text/plain": { schema: { type: "string" } } },
            },
          },
        },
      },
      "/llms-full.txt": {
        get: {
          operationId: "getLlmsFullTxt",
          summary: "Documentación completa concatenada en markdown.",
          responses: {
            "200": {
              description: "OK",
              content: { "text/plain": { schema: { type: "string" } } },
            },
          },
        },
      },
      "/sitemap.xml": {
        get: {
          operationId: "getSitemap",
          summary: "Sitemap de las páginas públicas indexables.",
          responses: { "200": { description: "OK" } },
        },
      },
      "/.well-known/mcp.json": {
        get: {
          operationId: "getMcpDescriptor",
          summary: "Descriptor de los servidores MCP de Clara.",
          responses: {
            "200": {
              description: "OK",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/mcp": {
        post: {
          operationId: "callPublicMcp",
          summary:
            "Servidor MCP público (sin auth). Usá el cliente MCP que prefieras.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object" } } },
          },
          responses: {
            "200": {
              description: "Streamable HTTP MCP response",
              content: {
                "application/json": { schema: { type: "object" } },
                "text/event-stream": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/api/mcp/user": {
        post: {
          operationId: "callUserMcp",
          summary:
            "Servidor MCP autenticado por usuario. Requiere bearer token generado en Settings.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object" } } },
          },
          responses: {
            "200": {
              description: "Streamable HTTP MCP response",
              content: {
                "application/json": { schema: { type: "object" } },
                "text/event-stream": { schema: { type: "string" } },
              },
            },
            "401": { description: "Token inválido o expirado" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "clara_pat",
          description:
            "Token personal de acceso para Clara (formato `clara_pat_<32-hex>`; tokens viejos con prefijo `ada_pat_` siguen funcionando). " +
            "Se genera en Settings → Acceso para AI.",
        },
      },
    },
    externalDocs: { description: "Marketing site", url: site },
  };

  return NextResponse.json(schema, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" },
  });
}

export const dynamic = "force-static";
