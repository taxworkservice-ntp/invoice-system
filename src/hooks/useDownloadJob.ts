import { useCallback, useRef, useState } from "react";

export type DownloadJobStatus = "idle" | "running" | "done" | "error";

export interface DownloadJobFailure {
  id?: string;
  label: string;
  error?: string;
}

export interface DownloadJobResult {
  total: number;
  succeeded: number;
  failed: number;
  /** Human label for the finished artifact (zip / xlsx / csv). */
  artifact?: string;
  failures?: DownloadJobFailure[];
}

export interface DownloadJobContext {
  signal: AbortSignal;
  onProgress: (current: number, total: number) => void;
}

export interface DownloadJobState {
  status: DownloadJobStatus;
  current: number;
  total: number;
  result: DownloadJobResult | null;
  error: string | null;
}

const IDLE: DownloadJobState = { status: "idle", current: 0, total: 0, result: null, error: null };

/**
 * Single "download job" state machine reused by every export entry point:
 * idle → running (progress + cancel) → done/error (result summary).
 */
export function useDownloadJob() {
  const [state, setState] = useState<DownloadJobState>(IDLE);
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (task: (ctx: DownloadJobContext) => Promise<DownloadJobResult | void>): Promise<DownloadJobResult | null> => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ status: "running", current: 0, total: 0, result: null, error: null });
      try {
        const result = await task({
          signal: controller.signal,
          onProgress: (current, total) => setState((prev) => ({ ...prev, current, total })),
        });
        setState((prev) => ({ ...prev, status: "done", result: result ?? null }));
        return result ?? null;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
        }));
        return null;
      } finally {
        controllerRef.current = null;
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => setState(IDLE), []);

  return { ...state, run, cancel, reset };
}
