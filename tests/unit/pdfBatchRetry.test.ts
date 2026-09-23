import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/api", () => {
  class ApiRequestError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "ApiRequestError";
      this.status = status;
    }
  }
  return { ApiRequestError, apiFetchBlob: vi.fn() };
});

import { ApiRequestError, apiFetchBlob } from "../../src/lib/api";
import { fetchDocumentPdfs } from "../../src/lib/download/pdfBatch";

const mockApiFetchBlob = vi.mocked(apiFetchBlob);

const SOURCE = { id: "doc-1", doc_number: "RC-2026-09-0001", issue_date: "2026-09-01" };

// The retry backoff uses a real setTimeout; drive it with fake timers before
// awaiting the pending batch promise.
async function runWithTimers<T>(promise: Promise<T>, ms = 10_000): Promise<T> {
  await vi.advanceTimersByTimeAsync(ms);
  return promise;
}

describe("fetchDocumentPdfs retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockApiFetchBlob.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the blob without retrying on success", async () => {
    mockApiFetchBlob.mockResolvedValue(new Blob(["pdf"]));
    const results = await fetchDocumentPdfs([SOURCE], { concurrency: 1 });
    expect(mockApiFetchBlob).toHaveBeenCalledTimes(1);
    expect(results[0].ok).toBe(true);
  });

  it("retries once after a transient 502 and then succeeds", async () => {
    mockApiFetchBlob
      .mockRejectedValueOnce(new ApiRequestError(502, "render failed"))
      .mockResolvedValueOnce(new Blob(["pdf"]));
    const results = await runWithTimers(fetchDocumentPdfs([SOURCE], { concurrency: 1 }));
    expect(mockApiFetchBlob).toHaveBeenCalledTimes(2);
    expect(results[0].ok).toBe(true);
  });

  it("does not retry a non-retryable 404", async () => {
    mockApiFetchBlob.mockRejectedValueOnce(new ApiRequestError(404, "Document not found"));
    const results = await fetchDocumentPdfs([SOURCE], { concurrency: 1 });
    expect(mockApiFetchBlob).toHaveBeenCalledTimes(1);
    expect(results[0].ok).toBe(false);
    expect(results[0].error ?? "").toContain("HTTP 404");
  });

  it("reports the HTTP status after exhausting retries on a 504", async () => {
    mockApiFetchBlob.mockRejectedValue(new ApiRequestError(504, "Gateway Timeout"));
    const results = await runWithTimers(fetchDocumentPdfs([SOURCE], { concurrency: 1 }));
    expect(mockApiFetchBlob).toHaveBeenCalledTimes(2);
    expect(results[0].ok).toBe(false);
    expect(results[0].error ?? "").toContain("HTTP 504");
  });
});
