import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { PrintDocument } from "../../../components/print/PrintDocument";
import type { CopyType } from "../../../components/print/PrintDocument";
import { PrintDocumentClassic } from "../../../components/print/PrintDocumentClassic";
import { PrintDocumentClassicV2 } from "../../../components/print/PrintDocumentClassicV2";
import { PrintErrorBoundary } from "../../../components/print/PrintErrorBoundary";
import { getPrintDocumentData, type PrintDocumentData } from "../../../lib/print";
import { paginateRows, type GenericPageBatch } from "../../../lib/pagination";
import {
  estimateLineItemHeight,
  estimateSummaryRowHeight,
} from "../../../lib/printRowHeight";
import type {
  BillingNoteInvoice,
  DocumentLineItem,
  ReceiptInvoice,
} from "../../../types";

import { supabase } from "../../../lib/supabase";

type CopyOrder = "original-first" | "copy-first";

type PrintBatch =
  | { kind: "line_items"; batch: GenericPageBatch<DocumentLineItem> }
  | { kind: "billing_invoices"; batch: GenericPageBatch<BillingNoteInvoice> }
  | { kind: "receipt_invoices"; batch: GenericPageBatch<ReceiptInvoice> };

function getPrintBatches(data: PrintDocumentData, blankForm = false): PrintBatch[] {
  if (data.document.doc_type === "billing_note" && data.document.vat_registered) {
    return paginateRows(
      data.billingNoteInvoices,
      data.template,
      "summary_rows",
      { estimateHeight: () => estimateSummaryRowHeight(data.template) },
    ).map((batch) => ({ kind: "billing_invoices", batch }));
  }

  if (
    data.document.doc_type === "receipt" &&
    data.document.vat_registered &&
    data.receiptInvoices.length > 0
  ) {
    return paginateRows(
      data.receiptInvoices,
      data.template,
      "summary_rows",
      { estimateHeight: () => estimateSummaryRowHeight(data.template) },
    ).map((batch) => ({ kind: "receipt_invoices", batch }));
  }

  const hideDeliveryAmounts =
    data.document.doc_type === "delivery_note" &&
    data.document.hide_amounts_on_print !== false;
  const effectiveHideAmounts = blankForm ? false : hideDeliveryAmounts;

  return paginateRows(data.lineItems, data.template, "line_items", {
    estimateHeight: (item) =>
      estimateLineItemHeight(item, data.template, { hideDeliveryAmounts: effectiveHideAmounts }),
  }).map((batch) => ({ kind: "line_items", batch }));
}

export default function DocumentPrintPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [data, setData] = useState<PrintDocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pdfError, setPdfError] = useState("");
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const previewSheetRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);
  const [previewViewportWidth, setPreviewViewportWidth] = useState<number | null>(null);
  const [previewMarginLeft, setPreviewMarginLeft] = useState<number | null>(null);
  const [savingPdf, setSavingPdf] = useState(false);
  const blankForm = data?.document.is_blank_form === true;
  const exportMode = searchParams.get("export") === "pdf";
  const exportCopyTypes = searchParams.get("copyTypes") === "copy,original"
    ? ["copy", "original"] as CopyType[]
    : searchParams.get("copyTypes") === "original,copy"
      ? ["original", "copy"] as CopyType[]
      : [searchParams.get("copyType") === "copy" ? "copy" : "original"] as CopyType[];
  const [copyType, setCopyType] = useState<CopyType>(exportCopyTypes[0] || "original");
  const [copyOrder, setCopyOrder] = useState<CopyOrder>(() => {
    if (typeof window === "undefined") return "original-first";
    return window.localStorage.getItem("invoice-system.copy-order") === "copy-first"
      ? "copy-first"
      : "original-first";
  });

  useEffect(() => {
    if (!exportMode) return;

    document.documentElement.classList.add("print-export-document");
    document.body.classList.add("print-export-document");
    document.documentElement.dataset.accentMode = "element";

    return () => {
      document.documentElement.classList.remove("print-export-document");
      document.body.classList.remove("print-export-document");
      delete document.documentElement.dataset.accentMode;
    };
  }, [exportMode]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!id) return;
      setLoading(true);
      setError("");
      try {
        const result = await getPrintDocumentData(id);
        if (cancelled) return;
        setData(result);
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "ไม่สามารถเปิดหน้าแสดงเอกสารได้";
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    function updatePreviewScale() {
      const frame = previewFrameRef.current;
      const sheet = previewSheetRef.current;
      if (!frame || !sheet) return;

      if (window.innerWidth >= 768) {
        setPreviewScale(1);
        setPreviewHeight(null);
        setPreviewViewportWidth(null);
        setPreviewMarginLeft(null);
        return;
      }

      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const availableWidth = Math.max(280, viewportWidth - 16);
      const sheetWidth = sheet.scrollWidth;
      const sheetHeight = sheet.scrollHeight;
      if (!sheetWidth || !sheetHeight) return;

      const scale = Math.min(1, availableWidth / sheetWidth);
      const scaledWidth = sheetWidth * scale;
      setPreviewScale(scale);
      setPreviewHeight(sheetHeight * scale);
      setPreviewViewportWidth(availableWidth);
      setPreviewMarginLeft((availableWidth - scaledWidth) / 2);
    }

    requestAnimationFrame(() => updatePreviewScale());

    const observer = new ResizeObserver(() => updatePreviewScale());
    if (previewSheetRef.current) observer.observe(previewSheetRef.current);

    window.addEventListener("resize", updatePreviewScale);
    window.visualViewport?.addEventListener("resize", updatePreviewScale);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePreviewScale);
      window.visualViewport?.removeEventListener("resize", updatePreviewScale);
    };
  }, [data]);

  async function openBrowserPrintDialog() {
    const images = Array.from(document.querySelectorAll(".print-sheet img")) as HTMLImageElement[];
    const pendingImages = images.filter((img) => !img.complete);

    if (pendingImages.length === 0) {
      window.setTimeout(() => {
        window.focus();
        window.print();
      }, 250);
      return;
    }

    await Promise.all(
      pendingImages.map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
      ),
    );

    window.setTimeout(() => {
      window.focus();
      window.print();
    }, 250);
  }

  function handlePrint() {
    void openBrowserPrintDialog();
  }

  async function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const isMobile = window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent);

    try {
      const file = new File([blob], filename, { type: "application/pdf" });
      if (isMobile && typeof navigator.share === "function") {
        const shareData = { files: [file], title: filename };
        if (typeof navigator.canShare !== "function" || navigator.canShare(shareData)) {
          try {
            await navigator.share(shareData);
            return;
          } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
              return;
            }
            console.warn("Native PDF share failed; falling back to browser download:", err);
          }
        }
      }

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      if (isMobile) {
        window.setTimeout(() => {
          if (!document.hidden) {
            window.open(url, "_blank", "noopener,noreferrer");
          }
        }, 400);
      }
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

  function pdfFilename(data: PrintDocumentData) {
    const safeName = (data.clientProfile?.company_name_th || "")
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9\u0E00-\u0E7F\-_]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
    const docNumber = data.document.doc_number || "doc";
    const datePart = data.document.issue_date
      ? data.document.issue_date.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const parts = [docNumber];
    if (safeName) parts.push(safeName);
    parts.push(datePart);
    return `${parts.join("_")}.pdf`;
  }

  async function getServerPdfBlob(copyTypes: Array<"original" | "copy">) {
    if (!id) throw new Error("Missing document id");
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("No active session");

    const response = await fetch(`/api/documents/${encodeURIComponent(id)}/pdf`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ copyTypes }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `PDF export failed (${response.status})`);
    }

    return response.blob();
  }

  async function handleSavePdf() {
    if (savingPdf || !data) return;
    setSavingPdf(true);
    setPdfError("");
    try {
      await triggerDownload(await getServerPdfBlob(["original"]), pdfFilename(data));
    } catch (err) {
      console.error("Failed to save PDF:", err);
      setPdfError("บันทึก PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSavingPdf(false);
    }
  }

  async function handleSaveBothPdf() {
    if (savingPdf || !data) return;
    setSavingPdf(true);
    setPdfError("");
    try {
      const copyTypes: Array<"original" | "copy"> = copyOrder === "copy-first"
        ? ["copy", "original"]
        : ["original", "copy"];
      await triggerDownload(await getServerPdfBlob(copyTypes), pdfFilename(data));
    } catch (err) {
      console.error("Failed to save PDF:", err);
      setPdfError("บันทึก PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSavingPdf(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#EEF2F6] flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#EEF2F6] px-6 py-10">
        <div className="mx-auto max-w-3xl rounded-[24px] border border-[#E4E7EC] bg-white p-8 shadow-sm">
          <h1 className="text-[24px] font-semibold text-[#101828]">ไม่สามารถแสดงเอกสารได้</h1>
          <p className="mt-3 text-[14px] text-[#475467]">{error || "ไม่สามารถเตรียมเอกสารสำหรับการพิมพ์ได้"}</p>
          <div className="mt-6">
            <Button variant="secondary" onClick={() => navigate(-1)}>
              กลับ
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (exportMode) {
    const batches = getPrintBatches(data, blankForm);
    return (
      <div className="print-export-stack">
        <PrintErrorBoundary onError={() => {}}>
          {exportCopyTypes.flatMap((type) =>
            batches.map(({ kind, batch }, i) => (
              <div className="print-export-page" key={`${type}-p${i}`}>
                {data.template === "classic" ? (
                  <PrintDocumentClassic
                    data={data}
                    copyType={type}
                    pageMode={batch.mode}
                    pageIndex={i + 1}
                    totalPages={batches.length}
                    batchLineItems={kind === "line_items" ? batch.items : undefined}
                    batchBillingNoteInvoices={kind === "billing_invoices" ? batch.items : undefined}
                    batchReceiptInvoices={kind === "receipt_invoices" ? batch.items : undefined}
                    summaryStartIndex={batch.startIndex}
                    blankForm={blankForm}
                  />
                ) : data.template === "classic_v2" ? (
                  <PrintDocumentClassicV2
                    data={data}
                    copyType={type}
                    pageMode={batch.mode}
                    pageIndex={i + 1}
                    totalPages={batches.length}
                    batchLineItems={kind === "line_items" ? batch.items : undefined}
                    batchBillingNoteInvoices={kind === "billing_invoices" ? batch.items : undefined}
                    batchReceiptInvoices={kind === "receipt_invoices" ? batch.items : undefined}
                    summaryStartIndex={batch.startIndex}
                    blankForm={blankForm}
                  />
                ) : (
                  <PrintDocument
                    data={data}
                    copyType={type}
                    pageMode={batch.mode}
                    pageIndex={i + 1}
                    totalPages={batches.length}
                    batchLineItems={kind === "line_items" ? batch.items : undefined}
                    batchBillingNoteInvoices={kind === "billing_invoices" ? batch.items : undefined}
                    batchReceiptInvoices={kind === "receipt_invoices" ? batch.items : undefined}
                    summaryStartIndex={batch.startIndex}
                    blankForm={blankForm}
                  />
                )}
              </div>
            )),
          )}
        </PrintErrorBoundary>
      </div>
    );
  }

return (
    <div className="print-preview-shell min-h-screen bg-cool-75 px-2 py-3 sm:px-4 sm:py-6">
      <div
        className="print-toolbar mx-auto mb-3 flex w-full max-w-[230mm] flex-col gap-3 rounded-xl border border-cool-200 bg-white px-3 py-3 shadow-sm sm:mb-4 sm:flex-row sm:items-center sm:justify-between sm:px-4"
        style={previewViewportWidth ? { maxWidth: `${previewViewportWidth}px` } : undefined}
      >
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-cool-400">ดาวน์โหลดเอกสาร</div>
          <div className="text-[15px] font-semibold text-ink-900">{data.document.doc_number || "เอกสาร"}</div>
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-cool-400">
              <span>ประเภท:</span>
              <div className="inline-flex overflow-hidden rounded-md border border-cool-200">
                <button
                  type="button"
                  onClick={() => setCopyType("original")}
                  className={`px-2.5 py-0.5 text-[10px] font-medium transition-colors ${copyType === "original" ? "bg-primary text-white" : "bg-white text-cool-500 hover:bg-cool-25"}`}
                >
                  ต้นฉบับ
                </button>
                <button
                  type="button"
                  onClick={() => setCopyType("copy")}
                  className={`border-l border-cool-200 px-2.5 py-0.5 text-[10px] font-medium transition-colors ${copyType === "copy" ? "bg-primary text-white" : "bg-white text-cool-500 hover:bg-cool-25"}`}
                >
                  สำเนา
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-cool-400">
              <span>ลำดับเมื่อดาวน์โหลด 2 ฉบับ:</span>
              <div className="inline-flex overflow-hidden rounded-md border border-cool-200">
                <button
                  type="button"
                  onClick={() => {
                    setCopyOrder("original-first");
                    window.localStorage.setItem("invoice-system.copy-order", "original-first");
                  }}
                  className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${copyOrder === "original-first" ? "bg-primary text-white" : "bg-white text-cool-500 hover:bg-cool-25"}`}
                >
                  ต้นฉบับ → สำเนา
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCopyOrder("copy-first");
                    window.localStorage.setItem("invoice-system.copy-order", "copy-first");
                  }}
                  className={`border-l border-cool-200 px-2.5 py-1 text-[10px] font-medium transition-colors ${copyOrder === "copy-first" ? "bg-primary text-white" : "bg-white text-cool-500 hover:bg-cool-25"}`}
                >
                  สำเนา → ต้นฉบับ
                </button>
              </div>
            </div>
          {data?.document.doc_type === "delivery_note" && data.document.is_blank_form ? (
            <div className="flex items-center gap-1.5 text-[11px] text-cool-400">
              <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">ฟอร์มเปล่า</span>
              <span>พิมพ์แล้วให้พนักงานกรอกจำนวนและราคาด้วยมือ</span>
            </div>
              ) : null}
        </div>
      </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <Button variant="secondary" onClick={() => navigate(-1)} className="flex-1 sm:flex-none">
            กลับ
          </Button>
          <Button variant="secondary" onClick={handlePrint} className="flex-1 sm:flex-none">
            พิมพ์
          </Button>
          <Button onClick={handleSavePdf} disabled={savingPdf} className="flex-1 sm:flex-none">
            {savingPdf ? "กำลังบันทึก..." : "บันทึกเป็น PDF"}
          </Button>
          <Button onClick={handleSaveBothPdf} disabled={savingPdf} variant="secondary" className="flex-1 sm:flex-none">
            {savingPdf ? "กำลังบันทึก..." : "ดาวน์โหลด 2 ฉบับ"}
          </Button>
          {pdfError ? (
            <div className="w-full text-right text-[11px] text-red-600">
              {pdfError}
            </div>
          ) : null}
        </div>
      </div>

      <div
        className="mx-auto w-full max-w-[230mm]"
        style={previewViewportWidth ? { maxWidth: `${previewViewportWidth}px` } : undefined}
      >
        <div
          ref={previewFrameRef}
          className="print-preview-frame"
          style={previewHeight ? { height: `${previewHeight}px` } : undefined}
        >
          <div
            ref={previewSheetRef}
            className="print-preview-scale"
            style={{
              transform: `scale(${previewScale})`,
              ...(previewMarginLeft != null ? { marginLeft: `${previewMarginLeft}px` } : {}),
            }}
          >
            <PrintErrorBoundary onError={() => {}}>
              {(() => {
const batches = getPrintBatches(data, blankForm);
                return batches.map(({ kind, batch }, i) => {
                  const props = {
                    data,
                    copyType,
                    pageMode: batch.mode,
                    pageIndex: i + 1,
                    totalPages: batches.length,
                    batchLineItems: kind === "line_items" ? batch.items : undefined,
                    batchBillingNoteInvoices: kind === "billing_invoices" ? batch.items : undefined,
                    batchReceiptInvoices: kind === "receipt_invoices" ? batch.items : undefined,
                    summaryStartIndex: batch.startIndex,
                    blankForm,
                  };
                  return data.template === "classic" ? (
                    <PrintDocumentClassic key={`p${i}`} {...props} />
                  ) : data.template === "classic_v2" ? (
                    <PrintDocumentClassicV2 key={`p${i}`} {...props} />
                  ) : (
                    <PrintDocument key={`p${i}`} {...props} />
                  );
                });
              })()}
            </PrintErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
