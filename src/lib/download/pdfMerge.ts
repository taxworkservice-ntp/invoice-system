import { PDFDocument } from "pdf-lib";

/**
 * Merge rendered PDF blobs into a single PDF (page order = input order).
 * Used for "single filing pack" exports. Loaded lazily by callers so pdf-lib
 * stays out of the main bundle.
 */
export async function mergePdfBlobs(blobs: readonly Blob[]): Promise<Blob> {
  if (blobs.length === 0) throw new Error("ไม่มีไฟล์สำหรับรวม");
  if (blobs.length === 1) return blobs[0];

  const merged = await PDFDocument.create();
  merged.setProducer("invoice-system");

  for (const blob of blobs) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }

  const output = await merged.save();
  return new Blob([output], { type: "application/pdf" });
}
