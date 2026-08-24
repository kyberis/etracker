import { jsonError, withApi } from "@/lib/http";
import { extractPdf } from "@/lib/pdf-extract";
import { requireUserId } from "@/lib/session";

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  return withApi(async () => {
    await requireUserId();

    const ct = request.headers.get("content-type") ?? "";
    if (!ct.includes("multipart/form-data")) {
      return jsonError("Send the PDF as multipart/form-data.", 400);
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return jsonError("File is missing.", 400);
    }
    if (!file.size || file.size > MAX_BYTES) {
      return jsonError("The PDF must be smaller than 12 MB.", 400);
    }
    const name = file.name.toLowerCase();
    const mime = file.type;
    if (
      !name.endsWith(".pdf") &&
      mime !== "application/pdf" &&
      mime !== "application/x-pdf"
    ) {
      return jsonError("Only PDF files are accepted.", 400);
    }

    const buf = Buffer.from(await file.arrayBuffer());
    let text: string | undefined;
    let images: { dataUrl: string; pageNumber: number }[] | undefined;
    try {
      ({ text, images } = await extractPdf(buf));
    } catch (err) {
      console.error("[etracker.extract-pdf] extract failed", err);
      return jsonError(
        "Could not read this PDF (password-protected, corrupted, or unsupported?). Try a screenshot or a CSV export.",
        422,
      );
    }

    if (!text && (!images || images.length === 0)) {
      return jsonError(
        "No selectable text nor page preview (scan without OCR, password-protected or corrupted file?). Try a screenshot or a CSV export.",
        422,
      );
    }

    return { text, images, filename: file.name };
  });
}
