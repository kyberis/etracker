import { NextResponse } from "next/server";

import { getSiteUrl } from "@/lib/seo";

/**
 * RFC 9116 — security.txt. Used by researchers, auto-scanners and bug-bounty
 * platforms to find the right contact for security disclosures.
 *
 * `Expires` is set ~12 months out and we re-serve the value on every request
 * (the value is computed at build time of the cached response since this is
 * a static handler).
 */
export async function GET() {
  const site = getSiteUrl();
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const body = `Contact: https://github.com/kyberis/etracker/security/advisories/new
Contact: mailto:security@trefolio.com
Expires: ${expires}
Preferred-Languages: es, en
Canonical: ${site}/.well-known/security.txt
Policy: https://github.com/kyberis/etracker/security/policy
Acknowledgments: ${site}/changelog
`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=86400",
    },
  });
}
