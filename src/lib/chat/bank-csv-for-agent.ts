/**
 * Parses a single CSV row respecting quoted fields (RFC-lite).
 */
function parseCsvRow(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out.map((s) => s.replace(/^"|"$/g, "").replace(/""/g, '"'));
}

function detectDelimiter(headerLine: string): string {
  const comma = (headerLine.match(/,/g) ?? []).length;
  const semi = (headerLine.match(/;/g) ?? []).length;
  const tab = headerLine.includes("\t");
  if (tab && !comma && !semi) return "\t";
  return semi > comma ? ";" : ",";
}

function normalizeHeader(h: string): string {
  return h
    .replace(/^\ufeff/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Pick column index whose header matches any substring needle. */
function pickColumn(headers: string[], needles: string[]): number {
  const norm = headers.map(normalizeHeader);
  for (const needle of needles) {
    const n = needle.toLowerCase();
    let i = norm.findIndex((h) => h === n);
    if (i >= 0) return i;
    i = norm.findIndex((h) => h.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

const MAX_ROWS = 500;
const MAX_INPUT_CHARS = 2_500_000;

/**
 * Converts a bank CSV into compact markdown for the assistant.
 */
export function formatBankCsvForAgent(rawInput: string, filename: string): string {
  const raw =
    rawInput.length > MAX_INPUT_CHARS ? rawInput.slice(0, MAX_INPUT_CHARS) : rawInput;
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return `(_CSV ${filename}: sin filas suficientes._)`;
  }

  const delimiter = detectDelimiter(lines[0]!);
  const headers = parseCsvRow(lines[0]!, delimiter);
  if (headers.length < 2) {
    return `(_CSV ${filename}: cabecera inválida._)`;
  }

  const iDate = pickColumn(headers, [
    "completed date",
    "started date",
    "date",
    "transaction date",
    "expense completed",
    "fecha",
    "booking date",
    "value date",
  ]);
  const iDesc = pickColumn(headers, [
    "description",
    "transaction description",
    "reference",
    "payee",
    "merchant",
    "details",
    "descripción",
    "note",
    "notes",
  ]);
  const iAmount = pickColumn(headers, [
    "amount",
    "payment amount",
    "orig amount",
    "importe",
    "value",
    "debit",
  ]);
  const iCurrency = pickColumn(headers, ["payment currency", "orig currency", "currency", "moneda"]);
  const iType = pickColumn(headers, ["type", "transaction type", "product", "tipo"]);

  if (iAmount < 0 && iDesc < 0) {
    const preview = lines
      .slice(0, 6)
      .map((l) => parseCsvRow(l, delimiter).join(" | "))
      .join("\n");
    return [
      `Archivo **${filename}** (cabeceras no reconocidas del todo; primeras filas tal cual):`,
      "```",
      preview,
      "```",
      "_Pedí al asistente que interprete columnas según los nombres de la primera fila._",
    ].join("\n");
  }

  const rows: string[] = [];
  for (let r = 1; r < lines.length && rows.length < MAX_ROWS; r++) {
    const cells = parseCsvRow(lines[r]!, delimiter);
    if (cells.every((c) => !c.trim())) continue;

    const date = iDate >= 0 ? (cells[iDate] ?? "").trim() : "";
    const desc = iDesc >= 0 ? (cells[iDesc] ?? "").trim() : "";
    const amount = iAmount >= 0 ? (cells[iAmount] ?? "").trim() : "";
    const cur = iCurrency >= 0 ? (cells[iCurrency] ?? "").trim() : "";
    const typ = iType >= 0 ? (cells[iType] ?? "").trim() : "";

    const parts = [date, typ, desc, amount ? (cur ? `${amount} ${cur}` : amount) : ""].filter(
      Boolean,
    );
    if (parts.length) {
      rows.push(`- ${parts.join(" · ")}`);
    }
  }

  const truncated = lines.length - 1 > MAX_ROWS;
  const head = [
    `Movimientos del CSV **${filename}** (export del banco):`,
    "",
    ...rows,
  ];
  if (truncated) {
    head.push("", `_Solo se listan las primeras ${MAX_ROWS} filas con datos._`);
  }
  return head.join("\n");
}
