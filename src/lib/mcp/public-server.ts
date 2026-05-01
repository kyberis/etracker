import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Locale } from "@/lib/i18n/locale";
import {
  marketingContent,
  type LocalisedMarketingContent,
} from "@/lib/marketing-content";
import { SITE_DESCRIPTION, SITE_NAME, getSiteUrl } from "@/lib/seo";

/**
 * Per-locale labels for the markdown headings we emit. Keep in sync with
 * `marketingContent(locale)` so the public MCP feels native in both languages.
 */
const LABELS: Record<
  Locale,
  {
    repoAndSupport: string;
    features: string;
    faq: string;
    faqNoMatches: (filter: string) => string;
    changelog: string;
    privacy: string;
    searchNoMatches: (query: string) => string;
    searchResults: (count: number, query: string) => string;
    sourceLabel: string;
    aboutResource: string;
    aboutDescription: string;
    featuresResource: string;
    featuresDescription: string;
    faqResource: string;
    faqDescription: string;
    privacyResource: string;
    privacyDescription: string;
    changelogResource: string;
    changelogDescription: string;
  }
> = {
  es: {
    repoAndSupport: "Repo y soporte",
    features: "Features de Clara",
    faq: "FAQ",
    faqNoMatches: (filter) => `No hay preguntas que matcheen "${filter}".`,
    changelog: "Changelog",
    privacy: "Política de privacidad",
    searchNoMatches: (query) =>
      `No se encontraron coincidencias para "${query}".`,
    searchResults: (count, query) =>
      `Resultados (${count}) para "${query}"`,
    sourceLabel: "Source",
    aboutResource: "Sobre Clara",
    aboutDescription:
      "Pitch de Clara, features, equipo y links principales en formato markdown.",
    featuresResource: "Features de Clara",
    featuresDescription: "Lista detallada de capacidades de Clara.",
    faqResource: "FAQ de Clara",
    faqDescription: "Preguntas frecuentes con respuestas oficiales.",
    privacyResource: "Política de privacidad",
    privacyDescription: "Cómo Clara trata tus datos.",
    changelogResource: "Changelog",
    changelogDescription: "Historial completo de releases de Clara.",
  },
  en: {
    repoAndSupport: "Repo and support",
    features: "Clara features",
    faq: "FAQ",
    faqNoMatches: (filter) => `No questions match "${filter}".`,
    changelog: "Changelog",
    privacy: "Privacy policy",
    searchNoMatches: (query) => `No matches found for "${query}".`,
    searchResults: (count, query) => `Results (${count}) for "${query}"`,
    sourceLabel: "Source",
    aboutResource: "About Clara",
    aboutDescription:
      "Clara's pitch, features, team and main links in markdown.",
    featuresResource: "Clara features",
    featuresDescription: "Detailed list of Clara's capabilities.",
    faqResource: "Clara FAQ",
    faqDescription: "Frequently asked questions with official answers.",
    privacyResource: "Privacy policy",
    privacyDescription: "How Clara handles your data.",
    changelogResource: "Changelog",
    changelogDescription: "Full release history for Clara.",
  },
};

/**
 * Renders Clara's marketing copy as a single markdown blob. Used by the
 * `clara://about` resource and the `getOverview` tool, plus a couple of the
 * search helpers below.
 */
function renderOverview(content: LocalisedMarketingContent, l: Locale): string {
  return [
    `# ${SITE_NAME}`,
    "",
    SITE_DESCRIPTION,
    "",
    content.HERO_PITCH,
    "",
    content.ELEVATOR_PITCH,
    "",
    `## ${LABELS[l].features}`,
    "",
    ...content.FEATURES.map(
      ({ emoji, title, description }) =>
        `- **${emoji} ${title}** — ${description}`,
    ),
    "",
    `## ${LABELS[l].repoAndSupport}`,
    "",
    `- ${getSiteUrl()}`,
    "- https://github.com/kyberis/etracker",
    "- https://trefolio.com",
  ].join("\n");
}

function renderFeatures(content: LocalisedMarketingContent, l: Locale): string {
  return [
    `# ${LABELS[l].features}`,
    "",
    ...content.FEATURES.flatMap(({ emoji, title, description }) => [
      `## ${emoji} ${title}`,
      "",
      description,
      "",
    ]),
  ].join("\n");
}

function renderFaq(
  content: LocalisedMarketingContent,
  l: Locale,
  filter?: string,
): string {
  const list = filter
    ? content.FAQ.filter(
        ({ question, answer }) =>
          question.toLowerCase().includes(filter.toLowerCase()) ||
          answer.toLowerCase().includes(filter.toLowerCase()),
      )
    : content.FAQ;
  if (list.length === 0) return LABELS[l].faqNoMatches(filter ?? "");
  return [
    `# ${LABELS[l].faq}`,
    "",
    ...list.flatMap(({ question, answer }) => [
      `## ${question}`,
      "",
      answer,
      "",
    ]),
  ].join("\n");
}

function renderChangelog(
  content: LocalisedMarketingContent,
  l: Locale,
  limit?: number,
): string {
  const list =
    typeof limit === "number" ? content.CHANGELOG.slice(0, limit) : content.CHANGELOG;
  return [
    `# ${LABELS[l].changelog}`,
    "",
    ...list.flatMap((entry) => [
      `## v${entry.version} — ${entry.title} (${entry.date})`,
      "",
      ...entry.highlights.map((h) => `- ${h}`),
      "",
    ]),
  ].join("\n");
}

function renderPrivacy(
  content: LocalisedMarketingContent,
  l: Locale,
): string {
  return [
    `# ${LABELS[l].privacy}`,
    "",
    ...content.PRIVACY_SECTIONS.flatMap(({ heading, body }) => [
      `## ${heading}`,
      "",
      ...body.flatMap((p) => [p, ""]),
    ]),
  ].join("\n");
}

function searchDocs(
  content: LocalisedMarketingContent,
  l: Locale,
  query: string,
): string {
  const haystack: { source: string; title: string; text: string }[] = [
    {
      source: "overview",
      title: "Overview",
      text: renderOverview(content, l),
    },
    ...content.FEATURES.map((f) => ({
      source: "features",
      title: `Feature: ${f.title}`,
      text: `${f.title}\n\n${f.description}`,
    })),
    ...content.FAQ.map((q) => ({
      source: "faq",
      title: q.question,
      text: q.answer,
    })),
    ...content.CHANGELOG.map((c) => ({
      source: "changelog",
      title: `v${c.version} — ${c.title}`,
      text: c.highlights.join("\n"),
    })),
    ...content.PRIVACY_SECTIONS.map((p) => ({
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
  if (matches.length === 0) return LABELS[l].searchNoMatches(query);
  return [
    `# ${LABELS[l].searchResults(matches.length, query)}`,
    "",
    ...matches.flatMap(({ source, title, text }, idx) => [
      `## ${idx + 1}. ${title}`,
      `_${LABELS[l].sourceLabel}: ${source}_`,
      "",
      text,
      "",
    ]),
  ].join("\n");
}

/**
 * Wires Clara's public, no-auth MCP server. Exposes the marketing copy as
 * resources, tools and prompts so any AI client (Claude Desktop, Cursor,
 * ChatGPT, etc.) can answer "what is Clara?" questions without needing a
 * user account.
 *
 * Resource URIs use the `clara://` scheme. Older clients may have cached the
 * pre-rebrand `ada://` URIs; both schemes resolve to the same documents.
 */
export function registerPublicMcp(
  server: McpServer,
  locale: Locale = "es",
): void {
  const content = marketingContent(locale);
  const labels = LABELS[locale];

  // ── Resources ───────────────────────────────────────────────────────────
  server.registerResource(
    "about",
    "clara://about",
    {
      title: labels.aboutResource,
      description: labels.aboutDescription,
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: renderOverview(content, locale),
        },
      ],
    }),
  );

  server.registerResource(
    "features",
    "clara://features",
    {
      title: labels.featuresResource,
      description: labels.featuresDescription,
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: renderFeatures(content, locale),
        },
      ],
    }),
  );

  server.registerResource(
    "faq",
    "clara://faq",
    {
      title: labels.faqResource,
      description: labels.faqDescription,
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: renderFaq(content, locale),
        },
      ],
    }),
  );

  server.registerResource(
    "privacy",
    "clara://privacy",
    {
      title: labels.privacyResource,
      description: labels.privacyDescription,
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: renderPrivacy(content, locale),
        },
      ],
    }),
  );

  server.registerResource(
    "changelog",
    "clara://changelog",
    {
      title: labels.changelogResource,
      description: labels.changelogDescription,
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: renderChangelog(content, locale),
        },
      ],
    }),
  );

  // ── Tools ───────────────────────────────────────────────────────────────
  server.registerTool(
    "getOverview",
    {
      title: locale === "en" ? "Clara overview" : "Overview de Clara",
      description:
        locale === "en"
          ? "Returns a markdown summary of what Clara is, its features and main links."
          : "Devuelve un resumen markdown con qué es Clara, sus features y links principales.",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text", text: renderOverview(content, locale) }],
    }),
  );

  server.registerTool(
    "getFeatures",
    {
      title: locale === "en" ? "List features" : "Listar features",
      description:
        locale === "en"
          ? "Detailed list of Clara's capabilities in markdown."
          : "Lista detallada de capacidades de Clara en markdown.",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text", text: renderFeatures(content, locale) }],
    }),
  );

  server.registerTool(
    "getFaq",
    {
      title: locale === "en" ? "Frequently asked questions" : "Preguntas frecuentes",
      description:
        locale === "en"
          ? "Returns Clara's FAQ. Pass `query` to filter questions/answers containing that text."
          : "Devuelve la FAQ de Clara. Si pasás `query`, filtra preguntas/respuestas que contengan ese texto.",
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe(
            locale === "en"
              ? "Search text (case-insensitive)."
              : "Texto a buscar (case-insensitive).",
          ),
      },
    },
    async ({ query }) => ({
      content: [{ type: "text", text: renderFaq(content, locale, query) }],
    }),
  );

  server.registerTool(
    "getChangelog",
    {
      title: "Changelog",
      description:
        locale === "en"
          ? "Release history. Pass `limit` to cap results."
          : "Historial de releases. Pasá `limit` para acotar.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ limit }) => ({
      content: [
        { type: "text", text: renderChangelog(content, locale, limit) },
      ],
    }),
  );

  server.registerTool(
    "searchDocs",
    {
      title:
        locale === "en" ? "Search public docs" : "Buscar en docs públicas",
      description:
        locale === "en"
          ? "Simple full-text search over overview, features, FAQ, changelog and privacy."
          : "Búsqueda full-text simple sobre overview, features, FAQ, changelog y privacy.",
      inputSchema: {
        query: z
          .string()
          .min(2)
          .describe(
            locale === "en"
              ? "Search text (min. 2 chars)."
              : "Texto a buscar (mínimo 2 chars).",
          ),
      },
    },
    async ({ query }) => ({
      content: [{ type: "text", text: searchDocs(content, locale, query) }],
    }),
  );

  // ── Prompts ─────────────────────────────────────────────────────────────
  server.registerPrompt(
    "pitch",
    {
      title: locale === "en" ? "Clara pitch" : "Pitch de Clara",
      description:
        locale === "en"
          ? "Generate a Clara pitch lasting N seconds when read aloud."
          : "Genera un pitch de Clara en N segundos.",
      argsSchema: {
        seconds: z
          .enum(["10", "30", "60"])
          .optional()
          .describe(
            locale === "en"
              ? "Approximate pitch duration."
              : "Duración aproximada del pitch.",
          ),
      },
    },
    async ({ seconds }) => {
      const duration = seconds ?? "30";
      const text =
        locale === "en"
          ? `Generate a pitch for Clara that lasts about ${duration} seconds when read aloud. Neutral tone, no marketing-speak. Use this material as the source of truth:\n\n${renderOverview(content, locale)}`
          : `Generá un pitch de Clara que dure aproximadamente ${duration} segundos al ser leído en voz alta. Tono rioplatense, sin marketing-speak. Usá esta info como base:\n\n${renderOverview(content, locale)}`;
      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "compareWithCompetitors",
    {
      title:
        locale === "en"
          ? "Compare with competitors"
          : "Comparar con competidores",
      description:
        locale === "en"
          ? "Given a competitor (Mint, YNAB, Fintonic, etc.), explain the differences."
          : "Dado un competidor (Mint, YNAB, Fintonic, etc.), explicá las diferencias.",
      argsSchema: {
        competitor: z.string().min(2),
      },
    },
    async ({ competitor }) => {
      const text =
        locale === "en"
          ? `Compare Clara to ${competitor}. Be honest and specific, not generic. Use this Clara documentation:\n\n${renderOverview(content, locale)}\n\n${renderFeatures(content, locale)}`
          : `Compará Clara con ${competitor}. Sé honesto y específico, no genérico. Usá esta documentación de Clara:\n\n${renderOverview(content, locale)}\n\n${renderFeatures(content, locale)}`;
      return {
        messages: [
          { role: "user", content: { type: "text", text } },
        ],
      };
    },
  );

  server.registerPrompt(
    "howClaraWorks",
    {
      title: locale === "en" ? "How Clara works" : "Cómo funciona Clara",
      description:
        locale === "en"
          ? "Explain how Clara works under the hood (tech stack + data flow)."
          : "Explicá cómo funciona Clara bajo el capó (stack técnico + flow de datos).",
      argsSchema: {
        topic: z
          .enum(["pdf", "voz", "open-banking", "mcp", "general"])
          .optional(),
      },
    },
    async ({ topic }) => {
      const tt = topic ?? "general";
      const text =
        locale === "en"
          ? `Explain how ${tt === "general" ? "Clara overall" : tt} works under the hood. Aim at a curious developer. Reference material:\n\n${renderFeatures(content, locale)}\n\n${renderFaq(content, locale)}`
          : `Explicá cómo funciona ${tt === "general" ? "Clara en general" : tt} bajo el capó. Apuntá a un dev curioso. Material de referencia:\n\n${renderFeatures(content, locale)}\n\n${renderFaq(content, locale)}`;
      return {
        messages: [
          { role: "user", content: { type: "text", text } },
        ],
      };
    },
  );
}
