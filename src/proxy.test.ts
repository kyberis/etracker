import { describe, expect, it } from "vitest";

import { isPublicPathname } from "./proxy";

/**
 * The `proxy` middleware's auth gate is small but load-bearing. A
 * regression here means anonymous users can't accept a share-link
 * (whole guest-onboarding flow stops working) — exactly the bug
 * `0.12.1` fixed.
 *
 * We exercise `isPublicPathname` directly because spinning up a
 * `NextRequest` + `getToken` mock for every case is more code than the
 * helper itself.
 */
describe("isPublicPathname", () => {
  it("treats the root path as public", () => {
    expect(isPublicPathname("/")).toBe(true);
  });

  it("treats login and register as public", () => {
    expect(isPublicPathname("/login")).toBe(true);
    expect(isPublicPathname("/login/passkey")).toBe(true);
    expect(isPublicPathname("/register")).toBe(true);
  });

  it("treats /es and /en marketing trees as public", () => {
    expect(isPublicPathname("/es")).toBe(true);
    expect(isPublicPathname("/es/about")).toBe(true);
    expect(isPublicPathname("/en/events/share/abc")).toBe(true);
  });

  it("treats the public MCP discovery surface as public", () => {
    expect(isPublicPathname("/api/mcp")).toBe(true);
    expect(isPublicPathname("/api/mcp/tools")).toBe(true);
  });

  it("treats Agent Office internal routes as public (service token auth in handler)", () => {
    expect(isPublicPathname("/api/internal/office/savings-summary")).toBe(true);
    expect(isPublicPathname("/api/internal/office/propose-release")).toBe(true);
  });

  it("treats IdP ops-metrics as public (service token auth in handler)", () => {
    expect(isPublicPathname("/api/internal/ops-metrics")).toBe(true);
  });

  it("treats /api/events/share/* (preview + accept) as public", () => {
    // `GET /api/events/share/[token]` — anonymous preview.
    expect(isPublicPathname("/api/events/share/sometoken")).toBe(true);
    // `POST /api/events/share/[token]/accept` — anonymous join.
    expect(isPublicPathname("/api/events/share/sometoken/accept")).toBe(true);
    // The bare prefix itself.
    expect(isPublicPathname("/api/events/share")).toBe(true);
  });

  it("does NOT mark the OWNER-only mint endpoint as public", () => {
    // `POST /api/events/[id]/share` — different path: `[id]` segment is
    // BEFORE `share`. Must keep the auth check.
    expect(isPublicPathname("/api/events/abc123/share")).toBe(false);
    expect(isPublicPathname("/api/events/abc123/share/tokenid")).toBe(false);
  });

  it("does NOT mark random /api routes as public", () => {
    expect(isPublicPathname("/api/events")).toBe(false);
    expect(isPublicPathname("/api/months")).toBe(false);
    expect(isPublicPathname("/app")).toBe(false);
    expect(isPublicPathname("/settings")).toBe(false);
  });

  it("treats common static asset extensions as public", () => {
    expect(isPublicPathname("/icon.png")).toBe(true);
    expect(isPublicPathname("/manifest.webmanifest")).toBe(true);
    expect(isPublicPathname("/some-folder/font.woff2")).toBe(true);
  });

  it("does NOT treat /api/events/share-something (no `/` boundary) as public", () => {
    // Defensive: prefix matching uses `pathname === prefix || pathname.startsWith(`${prefix}/`)`,
    // so a sibling path with the same prefix substring must NOT match.
    expect(isPublicPathname("/api/events/share-stuff")).toBe(false);
  });
});
