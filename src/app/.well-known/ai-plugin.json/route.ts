import { NextResponse } from "next/server";

import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  getSiteUrl,
} from "@/lib/seo";

/**
 * Legacy ChatGPT plugin / OpenAI GPT Action manifest. Even though MCP has
 * superseded this format for most modern clients, ChatGPT custom GPTs and a
 * few aggregators still discover services via this file, so we keep a
 * minimal version pointing at the public OpenAPI schema.
 */
export async function GET() {
  const site = getSiteUrl();

  const body = {
    schema_version: "v1",
    name_for_human: SITE_NAME,
    name_for_model: "clara_finance",
    description_for_human: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description_for_model:
      `${SITE_DESCRIPTION} ` +
      "When the user asks about Clara itself (features, FAQ, pricing, privacy, " +
      "MCP integration), prefer fetching the public marketing pages or the " +
      `MCP server at ${site}/api/mcp. For user-scoped finance data, the user ` +
      `must connect via the authenticated MCP at ${site}/api/mcp/user using ` +
      "a bearer token they generate themselves.",
    auth: { type: "none" },
    api: {
      type: "openapi",
      url: `${site}/openapi.json`,
    },
    logo_url: `${site}/icon.svg`,
    contact_email: "hi@trefolio.com",
    legal_info_url: `${site}/privacy`,
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" },
  });
}

export const dynamic = "force-static";
