import { z } from "zod";

/**
 * Chart specification the agent can emit through the `renderChart` tool.
 *
 * The schema is intentionally flat (no discriminated unions, no
 * `record`) so it converts cleanly to JSON Schema for OpenAI tool
 * calling. Each chart `kind` only uses the fields documented in the
 * tool description; extras are ignored at render time.
 *
 * Data model:
 * - For bar / line / area: `xValues` are the X-axis labels, `series`
 *   is a list of named lines/bars/areas. Each series carries a
 *   `values` array aligned 1:1 with `xValues`.
 * - For pie: `slices` is a flat list of { name, value } segments.
 */

const seriesSchema = z.object({
  label: z.string().min(1),
  values: z.array(z.number()).min(1).max(120),
  color: z.string().optional(),
});

const sliceSchema = z.object({
  name: z.string().min(1),
  value: z.number().nonnegative(),
  color: z.string().optional(),
});

export const chartSpecSchema = z.object({
  kind: z.enum(["bar", "line", "area", "pie"]),
  title: z.string().min(1).max(120),
  description: z.string().max(280).optional(),
  currency: z.string().max(10).optional(),

  // Shared across bar / line / area.
  xValues: z.array(z.string()).min(1).max(120).optional(),
  series: z.array(seriesSchema).min(1).max(8).optional(),
  xLabel: z.string().max(40).optional(),
  yLabel: z.string().max(40).optional(),

  // Bar / area specific.
  stacked: z.boolean().optional(),
  // Bar specific.
  horizontal: z.boolean().optional(),

  // Pie specific.
  slices: z.array(sliceSchema).min(1).max(20).optional(),
});

export type ChartSpec = z.infer<typeof chartSpecSchema>;
