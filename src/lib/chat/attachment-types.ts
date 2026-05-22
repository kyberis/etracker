function extLower(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function normalizeMime(mime: string | undefined): string {
  return (mime ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
}

/** True when the attachment is a PDF (Telegram document or web File). */
export function isPdfAttachment(mime: string | undefined, filename: string): boolean {
  const m = normalizeMime(mime);
  if (m === "application/pdf" || m === "application/x-pdf") return true;
  if (extLower(filename) === ".pdf") return true;
  if (m === "application/octet-stream" && extLower(filename) === ".pdf") return true;
  return false;
}

/** True when the attachment is a bank CSV export (Telegram document or web File). */
export function isCsvAttachment(mime: string | undefined, filename: string): boolean {
  const m = normalizeMime(mime);
  if (
    m === "text/csv" ||
    m === "application/csv" ||
    m === "text/comma-separated-values" ||
    m === "application/vnd.ms-excel"
  ) {
    return true;
  }
  if (m === "text/plain" && extLower(filename) === ".csv") return true;
  if (m === "application/octet-stream" && extLower(filename) === ".csv") return true;
  return extLower(filename) === ".csv";
}
