import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/seo";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  // The OG card needs to be visually consistent with the favicon and the
  // PWA home-screen icon, so we embed the Clara avatar PNG that powers
  // both. Keeping a single source of truth means search engines, social
  // shares, and the iOS home screen all show the same face.
  const claraPng = await readFile(join(process.cwd(), "public/clara-icon.png"));
  const claraDataUrl = `data:image/png;base64,${claraPng.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background:
            "linear-gradient(135deg, #1B0F3A 0%, #2C1B5C 60%, #3D1F66 100%)",
          color: "#FBEFD3",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <img
            src={claraDataUrl}
            width={120}
            height={120}
            style={{
              borderRadius: 9999,
              border: "3px solid #C8FF7B",
            }}
            alt=""
          />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 64, fontWeight: 800, lineHeight: 1 }}>
              {SITE_NAME}
            </span>
            <span style={{ fontSize: 24, color: "#C8FF7B", marginTop: 8 }}>
              {SITE_TAGLINE}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>
            Tu plata,
            <br />
            finalmente clara.
          </div>
          <div style={{ fontSize: 24, color: "#FBEFD3CC", lineHeight: 1.4, maxWidth: 880 }}>
            {SITE_DESCRIPTION.slice(0, 160)}…
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 20,
            color: "#FBEFD3AA",
          }}
        >
          <div style={{ display: "flex", gap: 12 }}>
            <span
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                background: "#C8FF7B",
                color: "#1B0F3A",
                fontWeight: 700,
              }}
            >
              Open Source · MIT
            </span>
            <span
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.1)",
                color: "#FBEFD3",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              MCP-ready
            </span>
          </div>
          <span>trefolio.com</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
