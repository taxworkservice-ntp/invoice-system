import { apiFetchBlob } from "../api";
import { documentPdfFilename } from "./download";

export type PdfCopyType = "original" | "copy";

export interface PdfSource {
  id: string;
  doc_number?: string | null;
  issue_date?: string | null;
}

export interface PdfBatchResult {
  id: string;
  filename: string;
  ok: boolean;
  blob?: Blob;
  error?: string;
}

export interface PdfBatchOptions {
  copyTypes?: PdfCopyType[];
  companyName?: string | null;
  /** Parallel server renders. Kept low so a big batch doesn't stampede the API. */
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Fetch rendered PDFs for many documents through the cached server route
 * (POST /api/documents/:id/pdf). Returns a per-file result so callers can show
 * an honest success/failure summary and retry the failures.
 */
export async function fetchDocumentPdfs(
  sources: readonly PdfSource[],
  options: PdfBatchOptions = {},
): Promise<PdfBatchResult[]> {
  const { copyTypes = ["original"], companyName, concurrency = 3, signal, onProgress } = options;
  const total = sources.length;
  const results: PdfBatchResult[] = new Array(total);
  let nextIndex = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    for (;;) {
      if (signal?.aborted) return;
      const index = nextIndex++;
      if (index >= total) return;

      const source = sources[index];
      const filename = documentPdfFilename(source.doc_number ?? null, companyName, source.issue_date);
      try {
        const blob = await apiFetchBlob(`/api/documents/${encodeURIComponent(source.id)}/pdf`, {
          method: "POST",
          body: JSON.stringify({ copyTypes }),
        });
        results[index] = { id: source.id, filename, ok: true, blob };
      } catch (error) {
        results[index] = {
          id: source.id,
          filename,
          ok: false,
          error: error instanceof Error ? error.message : "ไม่สามารถสร้าง PDF ได้",
        };
      } finally {
        completed += 1;
        onProgress?.(completed, total);
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, total || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results.filter(Boolean);
}
