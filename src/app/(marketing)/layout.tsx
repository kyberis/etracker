/**
 * Outer marketing layout — intentionally a pass-through. The locale-aware
 * chrome (header, footer, language switcher) lives in
 * `[lang]/layout.tsx` so it can read `params.lang`.
 */
export default function MarketingOuterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
