import { NextResponse } from "next/server";

import {
  HERO_PITCH,
  ELEVATOR_PITCH,
} from "@/lib/marketing-content";
import { SITE_NAME, SITE_TAGLINE, getSiteUrl } from "@/lib/seo";

/**
 * `/llms.txt` — short, structured pointer index per https://llmstxt.org so
 * LLMs and AI agents can discover Clara's documentation surface in one fetch.
 *
 * A more verbose, single-file dump of the marketing copy lives at
 * `/llms-full.txt`.
 */
export async function GET() {
  const site = getSiteUrl();
  const body = `# ${SITE_NAME}

> ${SITE_TAGLINE}. ${HERO_PITCH}

${ELEVATOR_PITCH}

## Documentación principal

- [Sobre Clara](${site}/about): historia, equipo (Trefolio), filosofía y origen del nombre.
- [Features](${site}/features): lista detallada de capacidades — chat multimodal, Open Banking, WhatsApp, MCP, self-hosting.
- [FAQ](${site}/faq): preguntas frecuentes sobre privacidad, costo, bancos soportados e integraciones AI.
- [Changelog](${site}/changelog): historial de releases con SemVer.
- [Privacidad](${site}/privacy): política de datos, zero data retention para LLM, derechos del usuario.

## Integración con AI assistants

- [MCP server público](${site}/api/mcp): Model Context Protocol sin auth, expone docs de Clara para que tu AI pueda responder “qué es Clara”, etc.
- [MCP server autenticado](${site}/api/mcp/user): MCP con bearer token (gestionado en Settings → Acceso para AI). Permite a tu AI consultar y modificar tu información financiera con tu permiso.
- [Descriptor MCP](${site}/.well-known/mcp.json): metadata machine-readable de los servidores MCP.
- [OpenAPI schema](${site}/openapi.json): superficie REST pública.
- [llms-full.txt](${site}/llms-full.txt): dump completo de la documentación marketing en un solo archivo de texto plano.

## Recursos

- [GitHub (kyberis/etracker)](https://github.com/kyberis/etracker): código fuente, MIT.
- [trefolio.com](https://trefolio.com): equipo detrás de Clara.

## Optional

- [Sitemap](${site}/sitemap.xml)
- [Robots policy](${site}/robots.txt)
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
