/**
 * Derive whether a month expense line is recurring or one-off for the
 * desktop grid badges / filters. See
 * `knowledge/product-specs/month-desktop-grid.md` §5.3.
 */

export type MonthLineKind = "RECURRING" | "ONE_OFF";

export type LineKindInput = {
  templateId: string | null;
  /** Present when the line still points at a template. */
  templateIsRecurring?: boolean | null;
};

export function resolveMonthLineKind(input: LineKindInput): MonthLineKind {
  if (input.templateId && input.templateIsRecurring === true) {
    return "RECURRING";
  }
  return "ONE_OFF";
}
