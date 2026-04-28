import { ImageResponse } from "next/og";

import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/seo";

export const runtime = "edge";
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
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
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 24,
              background: "linear-gradient(135deg, #C8FF7B 0%, #7FE26B 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44,
              fontWeight: 800,
              color: "#1B0F3A",
            }}
          >
            ∮
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 56, fontWeight: 800, lineHeight: 1 }}>
              {SITE_NAME}
            </span>
            <span style={{ fontSize: 22, color: "#C8FF7B", marginTop: 6 }}>
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
