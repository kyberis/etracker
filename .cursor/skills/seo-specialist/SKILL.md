---
name: seo-specialist
description: Maintains SEO and AI/LLM discoverability infrastructure for Clara — metadata, JSON-LD, sitemap, robots (with explicit AI crawler policies), llms.txt and llms-full.txt as dynamic routes, .well-known endpoints, OpenAPI, OG / Twitter images via next/og, hreflang es-AR / en, and the marketing-content single source of truth. Use when working on any of the above, or when adding a new public route, MCP tool surface, or marketing claim.
---

# SEO & AI Discoverability Specialist — Clara

## Mission

Clara is built to be discovered by both **traditional search engines** and
**generative AI engines** (ChatGPT, Claude, Perplexity, Gemini, Copilot,
Mistral, etc.). The SEO surface is unusually rich for a small product
because Clara *also* exposes herself as an MCP server — which means the
discovery layer (`/.well-known/*`, `openapi.json`, `llms.txt`,
`llms-full.txt`) is part of the API contract, not just SEO chrome.

Keep all of it consistent with the code and with `marketing-content.ts`.

## Primary files

| Concern | File |
|---------|------|
| Canonical SEO helpers | [`src/lib/seo.ts`](../../../src/lib/seo.ts) — `buildMetadata`, `jsonLdScript`, `breadcrumbJsonLd`, `getSiteUrl`, `SITE_NAME`, `SITE_DESCRIPTION_*`, `KEYWORDS_*`, `ORG_LEGAL_NAME`, `ORG_URL` |
| Site URL helper | [`src/lib/public-app-url.ts`](../../../src/lib/public-app-url.ts) |
| Default canonical origin | `DEFAULT_SITE_URL = "https://clara.trefolio.com"` (in `seo.ts`) |
| Marketing copy single source | [`src/lib/marketing-content.ts`](../../../src/lib/marketing-content.ts) (ES + EN) and [`src/lib/marketing-pages.ts`](../../../src/lib/marketing-pages.ts) (per-page copy via `*Copy(locale)` helpers) |
| Sitemap (dynamic) | [`src/app/sitemap.ts`](../../../src/app/sitemap.ts) + [`src/app/sitemap.test.ts`](../../../src/app/sitemap.test.ts) |
| Robots (with AI crawler rules) | [`src/app/robots.ts`](../../../src/app/robots.ts) |
| llms.txt (route) | `src/app/llms.txt/route.ts` (or directory) — content from [`src/lib/llms-content.ts`](../../../src/lib/llms-content.ts) |
| llms-full.txt (route) | `src/app/llms-full.txt/route.ts` — content from `llms-content.ts` |
| OpenAPI | `src/app/openapi.json/route.ts` |
| `.well-known/mcp.json` | [`src/app/.well-known/mcp.json/route.ts`](../../../src/app/.well-known/mcp.json/route.ts) |
| `.well-known/security.txt` | [`src/app/.well-known/security.txt/route.ts`](../../../src/app/.well-known/security.txt/route.ts) |
| `.well-known/ai-plugin.json` | `src/app/.well-known/ai-plugin.json/route.ts` |
| OG image (root) | [`src/app/opengraph-image.tsx`](../../../src/app/opengraph-image.tsx) (rendered by `next/og`) |
| Twitter image (root) | [`src/app/twitter-image.tsx`](../../../src/app/twitter-image.tsx) |
| Per-page OG/Twitter | `src/app/(marketing)/[lang]/opengraph-image.tsx` |
| Manifest | [`src/app/manifest.ts`](../../../src/app/manifest.ts) |
| Root metadata + locale | [`src/app/layout.tsx`](../../../src/app/layout.tsx) and [`src/app/(marketing)/[lang]/layout.tsx`](../../../src/app/(marketing)/[lang]/layout.tsx) |
| SEO unit test | [`src/lib/seo.test.ts`](../../../src/lib/seo.test.ts) |

## Page-level metadata pattern

Every public page under `(marketing)/[lang]/...` follows the canonical
pattern from [`src/app/(marketing)/[lang]/changelog/page.tsx`](../../../src/app/(marketing)/[lang]/changelog/page.tsx):

```ts
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const copy = pageCopy(lang); // from marketing-pages.ts
  return buildMetadata({
    title: copy.metaTitle,
    description: copy.metaDescription,
    path: `/${lang}/page-slug`,
    locale: lang,
    pathByLocale: { es: "/es/page-slug", en: "/en/page-slug" },
  });
}

export function generateStaticParams() {
  return [{ lang: "es" }, { lang: "en" }];
}
```

`buildMetadata` produces title, description, canonical, hreflang
alternates, OG, and Twitter card. Don't roll your own.

## Meta description pattern

Same shape as trefolio: **entity + differentiator + action**. EN factual.
ES rioplatense via [`ux-writer`](../ux-writer/SKILL.md) — voseo, sin
inglés corporativo, sin sermones.

Reference values live in `seo.ts` (`SITE_DESCRIPTION_ES`,
`SITE_DESCRIPTION_EN`).

## Structured data (JSON-LD)

Clara emits richer JSON-LD than typical SaaS — match the schema to the
page semantics:

| Schema | Where | Trigger |
|--------|-------|---------|
| `Organization` | Root layout | Brand identity |
| `WebSite` (with `SearchAction`) | Root layout | Site-level search hint |
| `SoftwareApplication` | Marketing root | App category, pricing, offers |
| `FAQPage` | `(marketing)/[lang]/faq/page.tsx` | When FAQ items render |
| `BreadcrumbList` | Every marketing sub-page | Hierarchical navigation |
| `Article` | `(marketing)/[lang]/changelog/page.tsx` (one per CHANGELOG entry) | Per-version article |

Use the helpers in `seo.ts`:

```tsx
<script {...jsonLdScript([breadcrumbJsonLd({ ... }), ...moreSchemas])} />
```

When you change copy in `marketing-content.ts` that the JSON-LD reads from
(FAQ, FEATURES, CHANGELOG), validate with the
[Schema Markup Validator](https://validator.schema.org/) — the JSON-LD must
mirror the rendered DOM exactly.

## AI / LLM discoverability

### Robots and explicit AI crawler policies

[`src/app/robots.ts`](../../../src/app/robots.ts) lists each AI crawler
explicitly. The current allowlist of bots that Clara wants reading the
marketing surface includes (per the README and robots.ts source):

`GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`, `Claude-Web`,
`anthropic-ai`, `PerplexityBot`, `Google-Extended`, `Applebot-Extended`,
`Amazonbot`, `Bytespider`, `CCBot`, `Meta-ExternalAgent`, `MistralAI-User`.

Rules:

- The private app paths (`/app`, `/m/`, `/banks`, `/expenses`,
  `/settings`, `/admin`, `/login`, `/register`, `/api/`) are
  **always** disallowed for everyone.
- Marketing surface (`/`, `/about`, `/features`, `/faq`, `/privacy`,
  `/changelog`, `/llms.txt`, `/llms-full.txt`, `/openapi.json`,
  `/.well-known/`, `/api/mcp`) is allowed.
- When a new AI crawler with a meaningful UA shows up, add it to
  `robots.ts` with an explicit rule.

### llms.txt and llms-full.txt (routes, not files)

Unlike many sites that ship a static `public/llms.txt`, Clara serves both
files as **dynamic Next.js routes** so they stay in sync with code:

- Route: `src/app/llms.txt/route.ts` and `src/app/llms-full.txt/route.ts`.
- Content: [`src/lib/llms-content.ts`](../../../src/lib/llms-content.ts) is
  the single source. Both routes read from there.
- The text is composed from the same primitives in `marketing-content.ts`
  (HERO, ELEVATOR, FEATURES, FAQ, PRIVACY, CHANGELOG) so updating marketing
  copy automatically updates LLM-facing text.

When you change `marketing-content.ts`, run
`npm test -- llms-content` (and the `seo.test.ts` / `sitemap.test.ts`
suites) to confirm the rendered output is still coherent.

### MCP discovery

The MCP servers (`/api/mcp` public, `/api/mcp/user` per-user) are part of
Clara's public API and are advertised at `/.well-known/mcp.json`. When you
add or change a tool / resource / prompt:

1. Add the test in `src/lib/mcp/public-server.test.ts` style.
2. Update `/.well-known/mcp.json/route.ts` if the discovery payload
   changes.
3. Update `openapi.json/route.ts` if the surface is exposed as REST.
4. Add a CHANGELOG entry per [`changelog`](../../rules/changelog.mdc).

### OG / Twitter images

OG and Twitter images are rendered dynamically via `next/og` (satori) at
`src/app/opengraph-image.tsx` and per-locale variants under
`(marketing)/[lang]/opengraph-image.tsx`. The Spanish text rendered into
the PNG is intentionally outside the i18n dictionary — that's why
`opengraph-image.tsx` is on the `IGNORED_FILES` allowlist in
`no-spanish-in-tsx.test.ts`.

Don't add raw PNGs to `public/` for OG — let `next/og` render them.

## Adding a new public page

When you add a new public marketing page:

1. Create the route at `src/app/(marketing)/[lang]/<slug>/page.tsx`.
2. Add per-page copy to `marketing-pages.ts` (ES + EN). Marketing claims
   live in `marketing-content.ts`; per-page metadata + body copy lives in
   `marketing-pages.ts`.
3. Implement `generateMetadata` and `generateStaticParams` exactly like
   `changelog/page.tsx`.
4. Add the canonical path to `sitemap.ts` (both `es` and `en` URLs) and
   extend `sitemap.test.ts`.
5. Add the path to `PUBLIC_ALLOW` in `robots.ts`.
6. If the page is user-facing and worth indexing by LLMs, mention it in
   `llms-content.ts`.
7. Add appropriate JSON-LD (`BreadcrumbList` minimum; `Article` /
   `FAQPage` if relevant) via `jsonLdScript([...])`.

## Content signals for AI engines

AI search engines favour:

- **Directly answerable sentences** — "Clara es una asistente financiera
  con IA" beats "Bienvenido a Clara".
- **Structured content** — headings, lists, definition lists, tables.
- **Factual specifics** — pricing (free / open source MIT), supported
  channels (web, Telegram).
- **Complete FAQ answers** that stand alone.
- **Consistent JSON-LD** matching rendered DOM.

When writing copy in `marketing-content.ts`, optimise for **extractability**
without losing the rioplatense voice — see
[`ux-writer`](../ux-writer/SKILL.md).

## Hreflang / i18n

- `metadataBase` = `getSiteUrl()` from `seo.ts`.
- Default locale: **ES (es-AR)**. Secondary: **EN**.
- Every public page emits `alternates` with both locale URLs. `buildMetadata`
  handles this when you pass `pathByLocale`.
- BCP-47 tags via `toBcp47(locale)` (returns `es-AR` or `en`).
- Do not introduce a third locale without rethinking the i18n stack —
  rioplatense ES is intentional, not "Spanish".

## Security headers

Security headers are part of search ranking signals. They live in the
Next.js config / middleware. Don't remove or weaken them; add to them
when CSP-relevant new origins are introduced.

## Checklist for SEO changes

```md
SEO Change Checklist
- [ ] All canonical URLs use https://clara.trefolio.com
      (DEFAULT_SITE_URL in seo.ts) unless overridden by env.
- [ ] generateMetadata uses buildMetadata({ ..., locale, pathByLocale }).
- [ ] sitemap.ts includes the new path for both locales; sitemap.test.ts
      passes.
- [ ] robots.ts allows the public path and disallows nothing private.
- [ ] llms-content.ts mentions the new surface if user-facing.
- [ ] JSON-LD added matches rendered DOM and validates on
      validator.schema.org.
- [ ] OG/Twitter images render correctly via next/og.
- [ ] If new MCP tool/resource: /.well-known/mcp.json + openapi.json
      updated and tested.
- [ ] If new AI crawler relevant: added to robots.ts with explicit rule.
- [ ] Copy lives in marketing-content.ts / marketing-pages.ts — not
      duplicated in the page itself.
- [ ] CI gates pass: lint + typecheck + test + build.
```

## Coordination

- Voice and rioplatense correctness:
  [`ux-writer`](../ux-writer/SKILL.md).
- Privacy / security claims, MCP token surface:
  [`legal-advisor`](../legal-advisor/SKILL.md).
- MCP tool registration and OpenAPI shape:
  [`engineer-integrations`](../engineer-integrations/SKILL.md).
- Test patterns for SEO routes / sitemap:
  [`qa-tester`](../qa-tester/SKILL.md).
- Releasing a user-visible SEO change → CHANGELOG entry per
  [`changelog`](../../rules/changelog.mdc).
