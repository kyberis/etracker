import { describe, expect, it } from "vitest";

import { isCsvAttachment, isPdfAttachment } from "./attachment-types";

describe("isPdfAttachment", () => {
  it("accepts standard PDF MIME types", () => {
    expect(isPdfAttachment("application/pdf", "statement.pdf")).toBe(true);
    expect(isPdfAttachment("application/x-pdf", "doc.pdf")).toBe(true);
  });

  it("accepts .pdf extension when MIME is missing or generic", () => {
    expect(isPdfAttachment("", "extracto.pdf")).toBe(true);
    expect(isPdfAttachment("application/octet-stream", "extracto.pdf")).toBe(true);
  });

  it("rejects octet-stream without .pdf extension", () => {
    expect(isPdfAttachment("application/octet-stream", "data.bin")).toBe(false);
  });

  it("rejects non-PDF types", () => {
    expect(isPdfAttachment("text/csv", "file.csv")).toBe(false);
    expect(isPdfAttachment("application/zip", "archive.zip")).toBe(false);
  });
});

describe("isCsvAttachment", () => {
  it("accepts common CSV MIME types", () => {
    expect(isCsvAttachment("text/csv", "movements.csv")).toBe(true);
    expect(isCsvAttachment("application/csv", "export.csv")).toBe(true);
    expect(isCsvAttachment("text/comma-separated-values", "data.csv")).toBe(true);
    expect(isCsvAttachment("application/vnd.ms-excel", "export.csv")).toBe(true);
  });

  it("accepts .csv extension with plain or octet-stream MIME", () => {
    expect(isCsvAttachment("text/plain", "bank.csv")).toBe(true);
    expect(isCsvAttachment("application/octet-stream", "bank.csv")).toBe(true);
    expect(isCsvAttachment("", "bank.csv")).toBe(true);
  });

  it("rejects octet-stream without .csv extension", () => {
    expect(isCsvAttachment("application/octet-stream", "data.bin")).toBe(false);
  });

  it("rejects non-CSV types", () => {
    expect(isCsvAttachment("application/pdf", "doc.pdf")).toBe(false);
    expect(
      isCsvAttachment(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "sheet.xlsx",
      ),
    ).toBe(false);
    expect(isCsvAttachment("application/msword", "doc.docx")).toBe(false);
  });
});
