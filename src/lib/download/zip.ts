export interface ZipEntry {
  /** Path inside the archive. May contain subfolders, e.g. "ใบแจ้งหนี้/INV-....pdf". */
  path: string;
  blob: Blob;
}

/** Package blobs into a ZIP, loading JSZip on demand. */
export async function buildZipBlob(entries: ZipEntry[]): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.path, entry.blob, { binary: true });
  }
  return zip.generateAsync({ type: "blob" });
}

/** Strip characters that are unsafe in zip paths while keeping Thai text. */
export function safeZipSegment(name: string): string {
  return (name || "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}
