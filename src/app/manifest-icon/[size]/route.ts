import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { renderBrandIcon } from "@/lib/pwa/brand-icon";

const SIZES: Record<
  string,
  { dimension: number; rounded: boolean; padding: number }
> = {
  "192": { dimension: 192, rounded: true, padding: 0 },
  "512": { dimension: 512, rounded: true, padding: 0 },
  // Maskable: leave 10% safe zone on each side so OS-applied masks
  // (rounded square, circle, squircle) don't crop the chart bars.
  maskable: { dimension: 512, rounded: false, padding: 52 },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size } = await params;
  const config = SIZES[size];
  if (!config) {
    return new Response("Not found", { status: 404 });
  }

  return new ImageResponse(renderBrandIcon(config), {
    width: config.dimension,
    height: config.dimension,
  });
}

export function generateStaticParams() {
  return Object.keys(SIZES).map((size) => ({ size }));
}
