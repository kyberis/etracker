import { jsonError, withApi } from "@/lib/http";
import { requireAdminUserId } from "@/lib/session";
import {
  getActiveSeries,
  getAiByModel,
  getAiSeries,
  getTopAiUsers,
} from "@/lib/analytics";

/**
 * Admin-only CSV export. Mirrors the datasets surfaced on
 * `/admin/analytics`. We render plain CSV (no library) because the rows
 * are tiny and well-typed — RFC-4180 quoting is enough.
 *
 * Query params:
 *  - dataset: dau | ai | by-model | top-users
 *  - days:    integer 1..365 (clamped server-side)
 */

const DATASETS = new Set(["dau", "ai", "by-model", "top-users"]);

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}

function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  return withApi(async () => {
    await requireAdminUserId();

    const url = new URL(request.url);
    const dataset = url.searchParams.get("dataset") ?? "";
    if (!DATASETS.has(dataset)) {
      return jsonError(
        "dataset must be one of: dau, ai, by-model, top-users.",
        400,
      );
    }
    const days = Number.parseInt(url.searchParams.get("days") ?? "90", 10);

    const stamp = new Date().toISOString().slice(0, 10);

    if (dataset === "dau") {
      const rows = await getActiveSeries(days);
      const csv = toCsv(
        ["day", "dau"],
        rows.map((r) => [r.day, r.dau]),
      );
      return csvResponse(`analytics-dau-${days}d-${stamp}.csv`, csv);
    }

    if (dataset === "ai") {
      const rows = await getAiSeries(days);
      const csv = toCsv(
        ["day", "messages", "input_tokens", "output_tokens", "cost_usd"],
        rows.map((r) => [
          r.day,
          r.messages,
          r.inputTokens,
          r.outputTokens,
          r.costUSD.toFixed(6),
        ]),
      );
      return csvResponse(`analytics-ai-${days}d-${stamp}.csv`, csv);
    }

    if (dataset === "by-model") {
      const rows = await getAiByModel(Math.min(days, 30));
      const csv = toCsv(
        ["model", "messages", "input_tokens", "output_tokens", "cost_usd"],
        rows.map((r) => [
          r.model,
          r.messages,
          r.inputTokens,
          r.outputTokens,
          r.costUSD.toFixed(6),
        ]),
      );
      return csvResponse(`analytics-by-model-${days}d-${stamp}.csv`, csv);
    }

    // top-users
    const rows = await getTopAiUsers(Math.min(days, 30));
    const csv = toCsv(
      ["user_id", "email", "name", "messages", "input_tokens", "output_tokens"],
      rows.map((r) => [
        r.userId,
        r.email,
        r.name ?? "",
        r.messages,
        r.inputTokens,
        r.outputTokens,
      ]),
    );
    return csvResponse(`analytics-top-users-${days}d-${stamp}.csv`, csv);
  });
}
