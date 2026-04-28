import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/seo";

/**
 * Public marketing routes — anything else under the root is the actual app
 * (auth-gated) and should not be crawled.
 */
const PUBLIC_ALLOW = [
  "/",
  "/about",
  "/features",
  "/faq",
  "/privacy",
  "/changelog",
  "/llms.txt",
  "/llms-full.txt",
  "/openapi.json",
  "/.well-known/",
  "/api/mcp",
];

const PRIVATE_DISALLOW = [
  "/app",
  "/m/",
  "/banks",
  "/expenses",
  "/settings",
  "/admin",
  "/login",
  "/register",
  "/api/",
];

/**
 * AI-specific bots we explicitly allow on the marketing surface so they can
 * read about Clara and surface it in answers. We still keep the private app
 * paths blocked for everyone.
 *
 * References:
 *  - GPTBot, OAI-SearchBot, ChatGPT-User: https://platform.openai.com/docs/bots
 *  - ClaudeBot, Claude-Web, anthropic-ai: https://www.anthropic.com/transparency-center
 *  - PerplexityBot, Perplexity-User: https://docs.perplexity.ai/guides/bots
 *  - Google-Extended (Bard / Gemini training): https://blog.google/technology/ai/an-update-on-web-publisher-controls/
 *  - Applebot-Extended (Apple Intelligence): https://support.apple.com/en-us/119829
 *  - Bytespider (ByteDance), Amazonbot, CCBot, Meta-ExternalAgent, cohere-ai, DuckAssistBot
 */
const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot",
  "Applebot-Extended",
  "Amazonbot",
  "Bytespider",
  "CCBot",
  "cohere-ai",
  "Cohere-AI",
  "Meta-ExternalAgent",
  "DuckAssistBot",
  "MistralAI-User",
  "YouBot",
];

export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      // Explicit, named rules for AI crawlers — same policy, but giving each
      // their own block makes intent obvious for bot operators that look for
      // their UA specifically and gives us a single place to flip the switch
      // if we ever need to opt out of one provider.
      {
        userAgent: AI_BOTS,
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
