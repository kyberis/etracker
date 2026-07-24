/** Desktop month grid feature flag (exec plan month-desktop-grid). */
export function isMonthDesktopGridEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MONTH_DESKTOP_GRID === "1";
}

export const MONTH_DESKTOP_MIN_WIDTH_PX = 1100;
export const MONTH_DESKTOP_MQ = `(min-width: ${MONTH_DESKTOP_MIN_WIDTH_PX}px)`;

export const MONTH_VIEW_STORAGE_KEY = "clara.monthPanel";

/** Exclusive panels on `/m/[month]` — only one body at a time. */
export type MonthPanel = "table" | "overview" | "chrono" | "incomes";

export function parseMonthPanel(
  value: string | null | undefined,
): MonthPanel | null {
  if (
    value === "table" ||
    value === "overview" ||
    value === "chrono" ||
    value === "incomes"
  ) {
    return value;
  }
  return null;
}

/** Default when nothing is stored: table on desktop grid, otherwise overview. */
export function defaultMonthPanel(tableAvailable: boolean): MonthPanel {
  return tableAvailable ? "table" : "overview";
}
