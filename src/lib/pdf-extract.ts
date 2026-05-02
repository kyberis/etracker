/**
 * Shared PDF text + page-image extractor used by the web `/api/chat/extract-pdf`
 * route AND the Telegram webhook so both surfaces stay in lockstep.
 *
 * Returns `text` when the PDF has a selectable text layer; otherwise renders
 * the first N pages as PNG data URLs so the agent can read them like a bank
 * screenshot. Returns `null` for both fields when neither extraction works.
 *
 * IMPORTANT: `pdf-parse` transitively loads `pdfjs-dist`, which references
 * `DOMMatrix` at module-evaluation time. In the Node.js serverless runtime
 * `DOMMatrix` doesn't exist, causing a crash on every request — even ones that
 * never touch PDFs — because the static import is evaluated eagerly. We avoid
 * this by (a) converting the import to a dynamic `import()` inside the function
 * body so the module is only evaluated when actually needed, and (b) polyfilling
 * `DOMMatrix` before that evaluation so pdfjs-dist doesn't throw.
 */

const MAX_TEXT_CHARS = 120_000;
const RENDER_MAX_PAGES = 2;
const RENDER_WIDTH_PX = 1000;

export type PdfExtractResult = {
  /** Normalised text content (may be undefined for image-only PDFs). */
  text?: string;
  /**
   * Page screenshots when there's no selectable text. Each entry is a PNG
   * data URL plus the source page number (1-indexed).
   */
  images?: { dataUrl: string; pageNumber: number }[];
  /** Total number of pages in the PDF. */
  pages: number;
};

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

/**
 * Convert a `data:image/png;base64,...` URL to a Buffer, ready to feed into
 * an AI SDK `ModelMessage` as an `image` content part.
 */
export function dataUrlToBuffer(dataUrl: string): {
  buffer: Buffer;
  mediaType: string;
} | null {
  const match = /^data:([^;]+);base64,(.+)$/u.exec(dataUrl);
  if (!match) return null;
  const [, mediaType, base64] = match;
  return { buffer: Buffer.from(base64, "base64"), mediaType };
}

/** Extract text + optional page images from a PDF buffer. */
export async function extractPdf(buffer: Buffer): Promise<PdfExtractResult> {
  // pdfjs-dist accesses DOMMatrix at module-evaluation time; polyfill before
  // the dynamic import so the library doesn't throw in Node.js serverless.
  if (typeof DOMMatrix === "undefined") {
    (globalThis as Record<string, unknown>).DOMMatrix = class DOMMatrix {};
  }
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText();
    let text = normalizePdfText(textResult.text);
    if (text.length > MAX_TEXT_CHARS) {
      text = `${text.slice(0, MAX_TEXT_CHARS)}\n\n[…text truncated for size]`;
    }
    const pages = Math.max(1, textResult.total || 1);

    let images: { dataUrl: string; pageNumber: number }[] | undefined;
    if (!text) {
      try {
        const pagesToRender = Math.min(RENDER_MAX_PAGES, pages);
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
        console.error("[etracker.pdf-extract] screenshot fallback", shotErr);
      }
    }

    return { text: text || undefined, images, pages };
  } finally {
    await parser.destroy();
  }
}
