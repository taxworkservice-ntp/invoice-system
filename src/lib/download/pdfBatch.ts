import { ApiRequestError, apiFetchBlob } from "../api";
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

// Server-side PDF renders are cold-start heavy; a transient 5xx (or a network
// blip) is worth one retry before reporting the file as failed.
const PDF_RETRY_ATTEMPTS = 2;
const PDF_RETRY_DELAY_MS = 1500;

function isRetryablePdfError(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) return false;
  return error.status === 408 || error.status === 429 || error.status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPdfWithRetry(
  source: PdfSource,
  copyTypes: readonly PdfCopyType[],
  signal?: AbortSignal,
): Promise<Blob> {
  let lastError: unknown;
  for (let attempt = 0; attempt < PDF_RETRY_ATTEMPTS; attempt++) {
    if (signal?.aborted) throw new Error("ยกเลิกการดาวน์โหลดแล้ว");
    try {
      return await apiFetchBlob(`/api/documents/${encodeURIComponent(source.id)}/pdf`, {
        method: "POST",
        body: JSON.stringify({ copyTypes }),
      });
    } catch (error) {
      lastError = error;
      if (attempt === PDF_RETRY_ATTEMPTS - 1 || !isRetryablePdfError(error)) throw error;
      await delay(PDF_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastError;
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
  const { copyTypes = ["original"], companyName, concurrency = 2, signal, onProgress } = options;
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
        const blob = await fetchPdfWithRetry(source, copyTypes, signal);
        results[index] = { id: source.id, filename, ok: true, blob };
      } catch (error) {
        // Keep the HTTP status on the label so the failure list distinguishes a
        // render error (502) from a platform timeout (504) at a glance.
        const message = error instanceof Error ? error.message : "ไม่สามารถสร้าง PDF ได้";
        const status = error instanceof ApiRequestError ? error.status : undefined;
        results[index] = {
          id: source.id,
          filename,
          ok: false,
          error: status ? `${message} (HTTP ${status})` : message,
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
