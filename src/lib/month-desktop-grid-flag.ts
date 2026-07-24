/** Desktop month grid feature flag (exec plan month-desktop-grid). */
export function isMonthDesktopGridEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MONTH_DESKTOP_GRID === "1";
}

export const MONTH_DESKTOP_MIN_WIDTH_PX = 1100;
export const MONTH_DESKTOP_MQ = `(min-width: ${MONTH_DESKTOP_MIN_WIDTH_PX}px)`;

export const MONTH_VIEW_STORAGE_KEY = "clara.monthView";
