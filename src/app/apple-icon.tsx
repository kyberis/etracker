import { ImageResponse } from "next/og";

import { renderBrandIcon } from "@/lib/pwa/brand-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  // iOS automatically applies its own rounded mask, so we render the
  // square version here and let the OS round the corners.
  return new ImageResponse(
    renderBrandIcon({ dimension: 180, rounded: false, padding: 0 }),
    { ...size },
  );
}
