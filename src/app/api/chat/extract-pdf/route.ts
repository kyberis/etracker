import { PDFParse } from "pdf-parse";

import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_CHARS = 120_000;
/** Primeras N páginas como imagen si no hay texto (PDF escaneado / imagen). */
const RENDER_MAX_PAGES = 2;
const RENDER_WIDTH_PX = 1000;

function normalizePdfText(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/\0/g, "")
    .replace(/[\u00ad\u200b-\u200f\u2028\u2029\ufeff]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(request: Request) {
  try {
    await requireUserId();
  } catch {
    return jsonError("Unauthorized.", 401);
  }

  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return jsonError("Enviá el PDF como multipart/form-data.", 400);
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonError("Falta el archivo.", 400);
  }
  if (!file.size || file.size > MAX_BYTES) {
    return jsonError("El PDF debe pesar menos de 12 MB.", 400);
  }
  const name = file.name.toLowerCase();
  const mime = file.type;
  if (!name.endsWith(".pdf") && mime !== "application/pdf" && mime !== "application/x-pdf") {
    return jsonError("Solo se aceptan archivos PDF.", 400);
  }

  let parser: PDFParse | undefined;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    parser = new PDFParse({ data: buf });
    const textResult = await parser.getText();
    let text = normalizePdfText(textResult.text);
    if (text.length > MAX_TEXT_CHARS) {
      text = `${text.slice(0, MAX_TEXT_CHARS)}\n\n[…texto truncado por tamaño]`;
    }

    let images: { dataUrl: string; pageNumber: number }[] | undefined;

    if (!text) {
      try {
        const pageCount = Math.max(1, textResult.total || 1);
        const pagesToRender = Math.min(RENDER_MAX_PAGES, pageCount);
        const shot = await parser.getScreenshot({
          first: pagesToRender,
          desiredWidth: RENDER_WIDTH_PX,
          imageBuffer: false,
          imageDataUrl: true,
        });
        images = shot.pages
          .filter((p) => typeof p.dataUrl === "string" && p.dataUrl.length > 64)
          .map((p) => ({ dataUrl: p.dataUrl, pageNumber: p.pageNumber }));
      } catch (shotErr) {
        console.error("extract-pdf screenshot fallback", shotErr);
      }
    }

    if (!text && (!images || images.length === 0)) {
      return jsonError(
        "No hay texto ni vista previa del PDF (¿escaneo sin OCR, contraseña o archivo dañado?). Probá una captura del extracto o export CSV.",
        422,
      );
    }

    return Response.json({
      text: text || undefined,
      images,
      filename: file.name,
    });
  } catch (e) {
    console.error("extract-pdf", e);
    return jsonError("No se pudo leer el PDF.", 500);
  } finally {
    if (parser) await parser.destroy();
  }
}
