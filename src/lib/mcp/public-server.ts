import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  CHANGELOG,
  ELEVATOR_PITCH,
  FAQ,
  FEATURES,
  HERO_PITCH,
  PRIVACY_SECTIONS,
} from "@/lib/marketing-content";
import { SITE_DESCRIPTION, SITE_NAME, getSiteUrl } from "@/lib/seo";

/**
 * Renders Clara's marketing copy as a single markdown blob. Used by the
 * `ada://about` resource and the `getOverview` tool, plus a couple of the
 * search helpers below.
 */
function renderOverview(): string {
  return [
    `# ${SITE_NAME}`,
    "",
    SITE_DESCRIPTION,
    "",
    HERO_PITCH,
    "",
    ELEVATOR_PITCH,
    "",
    "## Features",
    "",
    ...FEATURES.map(
      ({ emoji, title, description }) => `- **${emoji} ${title}** — ${description}`,
    ),
    "",
    "## Repo y soporte",
    "",
    `- ${getSiteUrl()}`,
    "- https://github.com/kyberis/etracker",
    "- https://trefolio.com",
  ].join("\n");
}

function renderFeatures(): string {
  return [
    "# Features de Clara",
    "",
    ...FEATURES.flatMap(({ emoji, title, description }) => [
      `## ${emoji} ${title}`,
      "",
      description,
      "",
    ]),
  ].join("\n");
}

function renderFaq(filter?: string): string {
  const list = filter
    ? FAQ.filter(
        ({ question, answer }) =>
          question.toLowerCase().includes(filter.toLowerCase()) ||
          answer.toLowerCase().includes(filter.toLowerCase()),
      )
    : FAQ;
  if (list.length === 0) return `No hay preguntas que matcheen "${filter}".`;
  return [
    "# FAQ",
    "",
    ...list.flatMap(({ question, answer }) => [`## ${question}`, "", answer, ""]),
  ].join("\n");
}

function renderChangelog(limit?: number): string {
  const list = typeof limit === "number" ? CHANGELOG.slice(0, limit) : CHANGELOG;
  return [
    "# Changelog",
    "",
    ...list.flatMap((entry) => [
      `## v${entry.version} — ${entry.title} (${entry.date})`,
      "",
      ...entry.highlights.map((h) => `- ${h}`),
      "",
    ]),
  ].join("\n");
}

function renderPrivacy(): string {
  return [
    "# Política de privacidad",
    "",
    ...PRIVACY_SECTIONS.flatMap(({ heading, body }) => [
      `## ${heading}`,
      "",
      ...body.flatMap((p) => [p, ""]),
    ]),
  ].join("\n");
}

function searchDocs(query: string): string {
  const haystack: { source: string; title: string; text: string }[] = [
    { source: "overview", title: "Overview", text: renderOverview() },
    ...FEATURES.map((f) => ({
      source: "features",
      title: `Feature: ${f.title}`,
      text: `${f.title}\n\n${f.description}`,
    })),
    ...FAQ.map((q) => ({
      source: "faq",
      title: q.question,
      text: q.answer,
    })),
    ...CHANGELOG.map((c) => ({
      source: "changelog",
      title: `v${c.version} — ${c.title}`,
      text: c.highlights.join("\n"),
    })),
    ...PRIVACY_SECTIONS.map((p) => ({
      source: "privacy",
      title: p.heading,
      text: p.body.join("\n"),
    })),
  ];
  const q = query.trim().toLowerCase();
  const matches = haystack.filter(
    ({ title, text }) =>
      title.toLowerCase().includes(q) || text.toLowerCase().includes(q),
  );
  if (matches.length === 0) {
    return `No se encontraron coincidencias para "${query}".`;
  }
  return [
    `# Resultados (${matches.length}) para "${query}"`,
    "",
    ...matches.flatMap(
      ({ source, title, text }, idx) => [
        `## ${idx + 1}. ${title}`,
        `_Source: ${source}_`,
        "",
        text,
        "",
      ],
    ),
  ].join("\n");
}

/**
 * Wires Clara's public, no-auth MCP server. Exposes the marketing copy as
 * resources, tools and prompts so any AI client (Claude Desktop, Cursor,
 * ChatGPT, etc.) can answer “what is Clara?” questions without needing a
 * user account.
 */
export function registerPublicMcp(server: McpServer): void {
  // ── Resources ───────────────────────────────────────────────────────────
  server.registerResource(
    "about",
    "ada://about",
    {
      title: "Sobre Clara",
      description:
        "Pitch de Clara, features, equipo y links principales en formato markdown.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: "text/markdown", text: renderOverview() },
      ],
    }),
  );

  server.registerResource(
    "features",
    "ada://features",
    {
      title: "Features de Clara",
      description: "Lista detallada de capacidades de Clara.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: "text/markdown", text: renderFeatures() },
      ],
    }),
  );

  server.registerResource(
    "faq",
    "ada://faq",
    {
      title: "FAQ de Clara",
      description: "Preguntas frecuentes con respuestas oficiales.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: "text/markdown", text: renderFaq() },
      ],
    }),
  );

  server.registerResource(
    "privacy",
    "ada://privacy",
    {
      title: "Política de privacidad",
      description: "Cómo Clara trata tus datos.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: "text/markdown", text: renderPrivacy() },
      ],
    }),
  );

  server.registerResource(
    "changelog",
    "ada://changelog",
    {
      title: "Changelog",
      description: "Historial completo de releases de Clara.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: "text/markdown", text: renderChangelog() },
      ],
    }),
  );

  // ── Tools ───────────────────────────────────────────────────────────────
  server.registerTool(
    "getOverview",
    {
      title: "Overview de Clara",
      description:
        "Devuelve un resumen markdown con qué es Clara, sus features y links principales.",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text", text: renderOverview() }],
    }),
  );

  server.registerTool(
    "getFeatures",
    {
      title: "Listar features",
      description: "Lista detallada de capacidades de Clara en markdown.",
      inputSchema: {},
    },
    async () => ({ content: [{ type: "text", text: renderFeatures() }] }),
  );

  server.registerTool(
    "getFaq",
    {
      title: "Preguntas frecuentes",
      description:
        "Devuelve la FAQ de Clara. Si pasás `query`, filtra preguntas/respuestas que contengan ese texto.",
      inputSchema: {
        query: z.string().optional().describe("Texto a buscar (case-insensitive)."),
      },
    },
    async ({ query }) => ({
      content: [{ type: "text", text: renderFaq(query) }],
    }),
  );

  server.registerTool(
    "getChangelog",
    {
      title: "Changelog",
      description: "Historial de releases. Pasá `limit` para acotar.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ limit }) => ({
      content: [{ type: "text", text: renderChangelog(limit) }],
    }),
  );

  server.registerTool(
    "searchDocs",
    {
      title: "Buscar en docs públicas",
      description:
        "Búsqueda full-text simple sobre overview, features, FAQ, changelog y privacy.",
      inputSchema: {
        query: z.string().min(2).describe("Texto a buscar (mínimo 2 chars)."),
      },
    },
    async ({ query }) => ({
      content: [{ type: "text", text: searchDocs(query) }],
    }),
  );

  // ── Prompts ─────────────────────────────────────────────────────────────
  server.registerPrompt(
    "pitch",
    {
      title: "Pitch de Clara",
      description: "Genera un pitch de Clara en N segundos.",
      argsSchema: {
        seconds: z
          .enum(["10", "30", "60"])
          .optional()
          .describe("Duración aproximada del pitch."),
      },
    },
    async ({ seconds }) => {
      const duration = seconds ?? "30";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Generá un pitch de Clara que dure aproximadamente ${duration} segundos al ser leído en voz alta. Tono rioplatense, sin marketing-speak. Usá esta info como base:\n\n${renderOverview()}`,
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "compareWithCompetitors",
    {
      title: "Comparar con competidores",
      description:
        "Dado un competidor (Mint, YNAB, Fintonic, etc.), explicá las diferencias.",
      argsSchema: {
        competitor: z.string().min(2),
      },
    },
    async ({ competitor }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Compará Clara con ${competitor}. Sé honesto y específico, no genérico. Usá esta documentación de Clara:\n\n${renderOverview()}\n\n${renderFeatures()}`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "howClaraWorks",
    {
      title: "Cómo funciona Clara",
      description:
        "Explicá cómo funciona Clara bajo el capó (stack técnico + flow de datos).",
      argsSchema: {
        topic: z
          .enum(["pdf", "voz", "open-banking", "mcp", "general"])
          .optional(),
      },
    },
    async ({ topic }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Explicá cómo funciona ${topic ?? "Clara en general"} bajo el capó. Apuntá a un dev curioso. Material de referencia:\n\n${renderFeatures()}\n\n${renderFaq()}`,
          },
        },
      ],
    }),
  );
}
