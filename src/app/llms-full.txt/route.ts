import { NextResponse } from "next/server";

import {
  CHANGELOG,
  ELEVATOR_PITCH,
  FAQ,
  FEATURES,
  HERO_PITCH,
  PRIVACY_SECTIONS,
} from "@/lib/marketing-content";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  getSiteUrl,
} from "@/lib/seo";

/**
 * `/llms-full.txt` — complete plain-text dump of every public marketing page,
 * concatenated in markdown. Lets LLM crawlers index Clara's full documentation
 * with a single request and avoids the need to render JS on every page.
 */
export async function GET() {
  const site = getSiteUrl();

  const featuresMd = FEATURES.map(
    ({ emoji, title, description }) => `- **${emoji} ${title}** — ${description}`,
  ).join("\n");

  const faqMd = FAQ.map(
    ({ question, answer }) => `### ${question}\n\n${answer}\n`,
  ).join("\n");

  const changelogMd = CHANGELOG.map(
    (entry) =>
      `### v${entry.version} · ${entry.date} — ${entry.title}\n\n${entry.highlights
        .map((h) => `- ${h}`)
        .join("\n")}\n`,
  ).join("\n");

  const privacyMd = PRIVACY_SECTIONS.map(
    ({ heading, body }) => `### ${heading}\n\n${body.join("\n\n")}\n`,
  ).join("\n");

  const body = `# ${SITE_NAME} — ${SITE_TAGLINE}

> Source of truth: ${site}
> License: MIT (open source)
> Repo: https://github.com/kyberis/etracker
> Maintainers: Trefolio (https://trefolio.com)
> MCP (public): ${site}/api/mcp
> MCP (per-user, bearer): ${site}/api/mcp/user

## Resumen

${SITE_DESCRIPTION}

${HERO_PITCH}

${ELEVATOR_PITCH}

## Features

${featuresMd}

## FAQ

${faqMd}

## Privacidad

${privacyMd}

## Changelog

${changelogMd}

## Cómo conectar Clara a tu AI assistant (Claude, ChatGPT, Cursor)

Clara expone dos servidores MCP (Model Context Protocol):

1. **Público — \`${site}/api/mcp\`**
   Sin auth. Expone documentación pública (features, FAQ, changelog, privacy) como resources y tools. Apto para que el AI conozca Clara y pueda responder preguntas sobre el producto.

2. **Por usuario — \`${site}/api/mcp/user\`**
   Autenticado por bearer token. Generás un token desde Settings → Acceso para AI (la app web). Pegás el token en el cliente MCP (Claude Desktop, Cursor, etc.) y tu asistente puede listar tus meses, consultar balance, agregar gastos, marcar líneas como pagado, etc., siempre con tu permiso explícito.

Configuración para Claude Desktop / Cursor (mcp.json):

\`\`\`json
{
  "mcpServers": {
    "clara": {
      "url": "${site}/api/mcp/user",
      "headers": { "Authorization": "Bearer <ada_pat_…>" }
    }
  }
}
\`\`\`

## Stack técnico

- Next.js 16 (App Router) sobre Vercel Fluid Compute
- React 19, Tailwind CSS 4
- Prisma 7 + Postgres
- Vercel AI SDK v6 + Vercel AI Gateway (multi-provider, zero data retention)
- NextAuth (credentials + Google OAuth)
- Vercel Blob para archivos
- Twilio para WhatsApp (texto, imágenes, voz)
- Whisper para transcripción de voz, OpenAI TTS para respuesta en audio
- GoCardless Bank Account Data para Open Banking

## Soporte

- Issues: https://github.com/kyberis/etracker/issues
- Sitio del equipo: https://trefolio.com
`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

export const dynamic = "force-static";
