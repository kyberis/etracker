/**
 * Shared icon renderer for the PWA. Mirrors the brand mark used in
 * `src/app/icon.svg` (teal background + ascending bar chart) so the
 * generated bitmap icons match the site favicon visually.
 */

const TEAL = "#0f766e";
const FOREGROUND = "#f0fdfa";

// Bar geometry in the original 32x32 SVG viewBox.
const BARS = [
  { x: 6, y: 18, h: 8 },
  { x: 13, y: 13, h: 13 },
  { x: 20, y: 7, h: 19 },
];
const BAR_W = 4.5;
const BAR_RADIUS = 1.5;

export function renderBrandIcon({
  dimension,
  rounded,
  padding,
}: {
  dimension: number;
  rounded: boolean;
  padding: number;
}) {
  const inner = dimension - padding * 2;
  const scale = inner / 32;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: TEAL,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: rounded ? `${dimension * 0.22}px` : 0,
      }}
    >
      <div
        style={{
          position: "relative",
          width: inner,
          height: inner,
          display: "flex",
        }}
      >
        {BARS.map((bar, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: bar.x * scale,
              top: bar.y * scale,
              width: BAR_W * scale,
              height: bar.h * scale,
              borderRadius: BAR_RADIUS * scale,
              background: FOREGROUND,
            }}
          />
        ))}
      </div>
    </div>
  );
}
