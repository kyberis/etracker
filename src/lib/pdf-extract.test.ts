import { describe, expect, it } from "vitest";
import { dataUrlToBuffer, extractPdf } from "./pdf-extract";

/** Minimal PDF 1.4 with selectable text "Hello Clara PDF". */
const MINIMAL_PDF = Buffer.from(
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA0NyA+PgpzdHJlYW0KQlQgL0YxIDI0IFRmIDEwMCA3MDAgVGQgKEhlbGxvIENsYXJhIFBERikgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzMzggMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0MDgKJSVFT0YK",
  "base64",
);

describe("extractPdf", () => {
  it("extracts selectable text and page count", async () => {
    const result = await extractPdf(MINIMAL_PDF);
    expect(result.pages).toBe(1);
    expect(result.text).toMatch(/Hello Clara PDF/);
    expect(result.images).toBeUndefined();
  });

  it("rejects garbage that is not a PDF", async () => {
    await expect(extractPdf(Buffer.from("not-a-pdf"))).rejects.toThrow();
  });
});

describe("dataUrlToBuffer", () => {
  it("decodes a png data URL", () => {
    const raw = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const dataUrl = `data:image/png;base64,${raw.toString("base64")}`;
    const parsed = dataUrlToBuffer(dataUrl);
    expect(parsed?.mediaType).toBe("image/png");
    expect(parsed?.buffer.equals(raw)).toBe(true);
  });

  it("returns null for non-data URLs", () => {
    expect(dataUrlToBuffer("https://example.com/x.png")).toBeNull();
  });
});
