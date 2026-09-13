import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../src/lib/api";
import { warmPdfCache } from "../../src/lib/pdfWarm";

vi.mock("../../src/lib/api", () => ({ apiFetch: vi.fn() }));

const mockApiFetch = vi.mocked(apiFetch);

function flush() {
  return vi.advanceTimersByTimeAsync(10);
}

describe("warmPdfCache", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    mockApiFetch.mockReset().mockResolvedValue({ success: true, cached: false });
  });

  it("ignores missing ids without calling the API", async () => {
    warmPdfCache(null);
    warmPdfCache(undefined);
    warmPdfCache("");
    await flush();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("warms with the single-copy variant and warm flag", async () => {
    warmPdfCache("doc-1");
    await flush();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/documents/doc-1/pdf",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((mockApiFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ copyTypes: ["original"], warm: true });
  });

  it("dedupes concurrent calls for the same document", async () => {
    warmPdfCache("doc-2");
    warmPdfCache("doc-2");
    warmPdfCache("doc-2");
    await flush();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it("skips re-warming within the TTL window", async () => {
    warmPdfCache("doc-3");
    await flush();
    vi.setSystemTime(1_000_000 + 60_000);
    warmPdfCache("doc-3");
    await flush();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it("re-warms after the TTL window expires", async () => {
    warmPdfCache("doc-4");
    await flush();
    vi.setSystemTime(1_000_000 + 6 * 60_000);
    warmPdfCache("doc-4");
    await flush();
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it("swallows API failures silently", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("network down"));
    warmPdfCache("doc-5");
    await flush();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    // A failed warm must not poison later attempts.
    warmPdfCache("doc-5");
    await flush();
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });
});
