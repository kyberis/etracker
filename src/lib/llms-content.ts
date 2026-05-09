import { marketingContent } from "@/lib/marketing-content";
import type { Locale } from "@/lib/i18n/locale";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  getSiteUrl,
} from "@/lib/seo";

const STRINGS = {
  es: {
    docsHeading: "Documentación principal",
    aboutLine: "[Sobre Clara]({about}): historia, equipo (Trefolio), filosofía y origen del nombre.",
    featuresLine:
      "[Features]({features}): lista detallada de capacidades — chat multimodal, Telegram, MCP, self-hosting.",
    faqLine:
      "[FAQ]({faq}): preguntas frecuentes sobre privacidad, costo, bancos soportados e integraciones AI.",
    changelogLine: "[Changelog]({changelog}): historial de releases con SemVer.",
    privacyLine:
      "[Privacidad]({privacy}): política de datos, zero data retention para LLM, derechos del usuario.",
    aiHeading: "Integración con AI assistants",
    mcpPublic:
      "[MCP server público]({mcp}): Model Context Protocol sin auth, expone docs de Clara para que tu AI pueda responder “qué es Clara”, etc.",
    mcpUser:
      "[MCP server autenticado]({mcpUser}): MCP con bearer token (gestionado en Settings → Acceso para AI). Permite a tu AI consultar y modificar tu información financiera con tu permiso.",
    mcpDescriptor: "[Descriptor MCP]({wellKnown}): metadata machine-readable de los servidores MCP.",
    openapi: "[OpenAPI schema]({openapi}): superficie REST pública.",
    llmsFull: "[llms-full.txt]({llmsFull}): dump completo de la documentación marketing en un solo archivo de texto plano.",
    resources: "Recursos",
    repoLine: "[GitHub (kyberis/etracker)]({repo}): código fuente, MIT.",
    teamLine: "[trefolio.com]({team}): equipo detrás de Clara.",
    optional: "Optional",
    ecosystemHeading: "Ecosistema Trefolio",
    willLine:
      "[Will]({will}): asistente de notas con IA por Telegram; open source (MIT), self-hostable.",
    sitemap: "[Sitemap]({sitemap})",
    robots: "[Robots policy]({robots})",
    summary: "Resumen",
    featuresHeading: "Features",
    faqHeading: "FAQ",
    privacyHeading: "Privacidad",
    changelogHeading: "Changelog",
    howToConnect: "Cómo conectar Clara a tu AI assistant (Claude, ChatGPT, Cursor)",
    mcpIntro: "Clara expone dos servidores MCP (Model Context Protocol):",
    mcpPublicDesc:
      "**Público — `{mcp}`**\n   Sin auth. Expone documentación pública (features, FAQ, changelog, privacy) como resources y tools. Apto para que el AI conozca Clara y pueda responder preguntas sobre el producto.",
    mcpUserDesc:
      "**Por usuario — `{mcpUser}`**\n   Autenticado por bearer token. Generás un token desde Settings → Acceso para AI (la app web). Pegás el token en el cliente MCP (Claude Desktop, Cursor, etc.) y tu asistente puede listar tus meses, consultar balance, agregar gastos, marcar líneas como pagado, etc., siempre con tu permiso explícito.",
    mcpJsonIntro: "Configuración para Claude Desktop / Cursor (mcp.json):",
    techStackHeading: "Stack técnico",
    techStack: [
      "Next.js 16 (App Router) sobre Vercel Fluid Compute",
      "React 19, Tailwind CSS 4",
      "Prisma 7 + Postgres",
      "Vercel AI SDK v6 + Vercel AI Gateway (multi-provider, zero data retention)",
      "NextAuth (credentials + Google OAuth)",
      "Vercel Blob para archivos",
      "Telegram Bot API (texto, imágenes, voz)",
      "Whisper para transcripción de voz, OpenAI TTS para respuesta en audio",
    ],
    supportHeading: "Soporte",
    supportLines: [
      "Issues: https://github.com/kyberis/etracker/issues",
      "Sitio del equipo: https://trefolio.com",
    ],
    sourceOfTruth: "Source of truth",
    license: "License: MIT (open source)",
    repoLabel: "Repo: https://github.com/kyberis/etracker",
    maintainersLabel: "Maintainers: Trefolio (https://trefolio.com)",
    mcpPublicLabel: "MCP (public)",
    mcpUserLabel: "MCP (per-user, bearer)",
  },
  en: {
    docsHeading: "Main documentation",
    aboutLine: "[About Clara]({about}): story, team (Trefolio), philosophy and origin of the name.",
    featuresLine:
      "[Features]({features}): detailed capabilities — multimodal chat, Telegram, MCP, self-hosting.",
    faqLine:
      "[FAQ]({faq}): frequently asked questions about privacy, cost, supported banks, and AI integrations.",
    changelogLine: "[Changelog]({changelog}): release history with SemVer.",
    privacyLine:
      "[Privacy]({privacy}): data policy, zero data retention for LLMs, user rights.",
    aiHeading: "AI assistant integration",
    mcpPublic:
      "[Public MCP server]({mcp}): Model Context Protocol without auth, exposes Clara's docs so your AI can answer “what is Clara”, etc.",
    mcpUser:
      "[Authenticated MCP server]({mcpUser}): MCP with bearer token (managed under Settings → AI access). Lets your AI read and modify your financial data with your permission.",
    mcpDescriptor: "[MCP descriptor]({wellKnown}): machine-readable metadata for the MCP servers.",
    openapi: "[OpenAPI schema]({openapi}): public REST surface.",
    llmsFull: "[llms-full.txt]({llmsFull}): full dump of the marketing documentation in a single plain-text file.",
    resources: "Resources",
    repoLine: "[GitHub (kyberis/etracker)]({repo}): source code, MIT.",
    teamLine: "[trefolio.com]({team}): the team behind Clara.",
    optional: "Optional",
    ecosystemHeading: "Trefolio ecosystem",
    willLine:
      "[Will]({will}): Telegram-first open-source AI note-taking assistant (MIT, self-hostable).",
    sitemap: "[Sitemap]({sitemap})",
    robots: "[Robots policy]({robots})",
    summary: "Summary",
    featuresHeading: "Features",
    faqHeading: "FAQ",
    privacyHeading: "Privacy",
    changelogHeading: "Changelog",
    howToConnect: "How to connect Clara to your AI assistant (Claude, ChatGPT, Cursor)",
    mcpIntro: "Clara exposes two MCP (Model Context Protocol) servers:",
    mcpPublicDesc:
      "**Public — `{mcp}`**\n   No auth. Exposes public documentation (features, FAQ, changelog, privacy) as resources and tools. Useful so the AI can answer general product questions about Clara.",
    mcpUserDesc:
      "**Per user — `{mcpUser}`**\n   Authenticated with a bearer token. You generate a token from Settings → AI access (the web app). Paste the token into the MCP client (Claude Desktop, Cursor, etc.) and your assistant can list your months, check balance, log expenses, mark lines as paid, etc., always with your explicit permission.",
    mcpJsonIntro: "Configuration for Claude Desktop / Cursor (mcp.json):",
    techStackHeading: "Tech stack",
    techStack: [
      "Next.js 16 (App Router) on Vercel Fluid Compute",
      "React 19, Tailwind CSS 4",
      "Prisma 7 + Postgres",
      "Vercel AI SDK v6 + Vercel AI Gateway (multi-provider, zero data retention)",
      "NextAuth (credentials + Google OAuth)",
      "Vercel Blob for files",
      "Telegram Bot API (text, images, voice)",
      "Whisper for voice transcription, OpenAI TTS for audio replies",
    ],
    supportHeading: "Support",
    supportLines: [
      "Issues: https://github.com/kyberis/etracker/issues",
      "Team site: https://trefolio.com",
    ],
    sourceOfTruth: "Source of truth",
    license: "License: MIT (open source)",
    repoLabel: "Repo: https://github.com/kyberis/etracker",
    maintainersLabel: "Maintainers: Trefolio (https://trefolio.com)",
    mcpPublicLabel: "MCP (public)",
    mcpUserLabel: "MCP (per-user, bearer)",
  },
} satisfies Record<Locale, Record<string, unknown>>;

function fmt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}

function localizedMarketingPath(locale: Locale, path: string): string {
  return `/${locale}${path}`;
}

export function renderLlmsIndex(locale: Locale): string {
  const site = getSiteUrl();
  const s = STRINGS[locale];
  const content = marketingContent(locale);

  const urls = {
    about: `${site}${localizedMarketingPath(locale, "/about")}`,
    features: `${site}${localizedMarketingPath(locale, "/features")}`,
    faq: `${site}${localizedMarketingPath(locale, "/faq")}`,
    changelog: `${site}${localizedMarketingPath(locale, "/changelog")}`,
    privacy: `${site}${localizedMarketingPath(locale, "/privacy")}`,
    mcp: `${site}/api/mcp`,
    mcpUser: `${site}/api/mcp/user`,
    wellKnown: `${site}/.well-known/mcp.json`,
    openapi: `${site}/openapi.json`,
    llmsFull: locale === "en" ? `${site}/en/llms-full.txt` : `${site}/llms-full.txt`,
    repo: "https://github.com/kyberis/etracker",
    team: "https://trefolio.com",
    will: "https://will.trefolio.com",
    sitemap: `${site}/sitemap.xml`,
    robots: `${site}/robots.txt`,
  };

  return `# ${SITE_NAME}

> ${SITE_TAGLINE}. ${content.HERO_PITCH}

${content.ELEVATOR_PITCH}

## ${s.docsHeading}

- ${fmt(s.aboutLine, urls)}
- ${fmt(s.featuresLine, urls)}
- ${fmt(s.faqLine, urls)}
- ${fmt(s.changelogLine, urls)}
- ${fmt(s.privacyLine, urls)}

## ${s.aiHeading}

- ${fmt(s.mcpPublic, urls)}
- ${fmt(s.mcpUser, urls)}
- ${fmt(s.mcpDescriptor, urls)}
- ${fmt(s.openapi, urls)}
- ${fmt(s.llmsFull, urls)}

## ${s.resources}

- ${fmt(s.repoLine, urls)}
- ${fmt(s.teamLine, urls)}

## ${s.ecosystemHeading}

- ${fmt(s.willLine, urls)}

## ${s.optional}

- ${fmt(s.sitemap, urls)}
- ${fmt(s.robots, urls)}
`;
}

export function renderLlmsFull(locale: Locale): string {
  const site = getSiteUrl();
  const s = STRINGS[locale];
  const content = marketingContent(locale);

  const featuresMd = content.FEATURES.map(
    ({ emoji, title, description }) => `- **${emoji} ${title}** — ${description}`,
  ).join("\n");

  const faqMd = content.FAQ.map(
    ({ question, answer }) => `### ${question}\n\n${answer}\n`,
  ).join("\n");

  const changelogMd = content.CHANGELOG.map(
    (entry) =>
      `### v${entry.version} · ${entry.date} — ${entry.title}\n\n${entry.highlights
        .map((h) => `- ${h}`)
        .join("\n")}\n`,
  ).join("\n");

  const privacyMd = content.PRIVACY_SECTIONS.map(
    ({ heading, body }) => `### ${heading}\n\n${body.join("\n\n")}\n`,
  ).join("\n");

  const mcp = `${site}/api/mcp`;
  const mcpUser = `${site}/api/mcp/user`;

  const mcpJson = `\`\`\`json
{
  "mcpServers": {
    "clara": {
      "url": "${mcpUser}",
      "headers": { "Authorization": "Bearer <clara_pat_…>" }
    }
  }
}
\`\`\``;

  return `# ${SITE_NAME} — ${SITE_TAGLINE}

> ${s.sourceOfTruth}: ${site}
> ${s.license}
> ${s.repoLabel}
> ${s.maintainersLabel}
> ${s.mcpPublicLabel}: ${mcp}
> ${s.mcpUserLabel}: ${mcpUser}

## ${s.summary}

${SITE_DESCRIPTION}

${content.HERO_PITCH}

${content.ELEVATOR_PITCH}

## ${s.featuresHeading}

${featuresMd}

## ${s.faqHeading}

${faqMd}

## ${s.privacyHeading}

${privacyMd}

## ${s.changelogHeading}

${changelogMd}

## ${s.howToConnect}

${s.mcpIntro}

1. ${fmt(s.mcpPublicDesc, { mcp })}

2. ${fmt(s.mcpUserDesc, { mcpUser })}

${s.mcpJsonIntro}

${mcpJson}

## ${s.techStackHeading}

${s.techStack.map((line) => `- ${line}`).join("\n")}

## ${s.ecosystemHeading}

- ${fmt(s.willLine, { will: "https://will.trefolio.com" })}

## ${s.supportHeading}

${s.supportLines.map((line) => `- ${line}`).join("\n")}
`;
}
