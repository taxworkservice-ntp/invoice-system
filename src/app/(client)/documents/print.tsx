import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { PrintDocument } from "../../../components/print/PrintDocument";
import type { CopyType } from "../../../components/print/PrintDocument";
import { PrintErrorBoundary } from "../../../components/print/PrintErrorBoundary";
import { generateModernPDFDocument, getPrintDocumentData, type PrintDocumentData } from "../../../lib/print";
import { DOC_TYPE_SHORT } from "../../../constants";

export default function DocumentPrintPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<PrintDocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const previewSheetRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);
  const [previewViewportWidth, setPreviewViewportWidth] = useState<number | null>(null);
  const [previewMarginLeft, setPreviewMarginLeft] = useState<number | null>(null);
  const [savingPdf, setSavingPdf] = useState(false);
  const [copyType, setCopyType] = useState<CopyType>("original");

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
          await navigator.share(shareData);
          return;
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

  async function handleSavePdf() {
    if (savingPdf || !data) return;
    setSavingPdf(true);
    try {
      const pdf = await generateModernPDFDocument(data, ["original"]);
      const short = DOC_TYPE_SHORT[data.document.doc_type];
      const datePart = data.document.issue_date
        ? data.document.issue_date.replace(/-/g, "")
        : new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = `${short}-${data.document.doc_number || "doc"}-${datePart}.pdf`;
      const blob = pdf.output("blob");
      await triggerDownload(blob, filename);
    } catch (err) {
      console.error("Failed to save PDF:", err);
      void openBrowserPrintDialog();
    } finally {
      setSavingPdf(false);
    }
  }

  async function handleSaveBothPdf() {
    if (savingPdf || !data) return;
    setSavingPdf(true);
    try {
      const pdf = await generateModernPDFDocument(data, ["original", "copy"]);
      const short = DOC_TYPE_SHORT[data.document.doc_type];
      const datePart = data.document.issue_date
        ? data.document.issue_date.replace(/-/g, "")
        : new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = `${short}-${data.document.doc_number || "doc"}-${datePart}.pdf`;
      const blob = pdf.output("blob");
      await triggerDownload(blob, filename);
    } catch (err) {
      console.error("Failed to save PDF:", err);
      void openBrowserPrintDialog();
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

return (
    <div className="print-preview-shell min-h-screen bg-[#EEF2F6] px-2 py-3 sm:px-4 sm:py-6">
      <div
        className="print-toolbar mx-auto mb-3 flex w-full max-w-[230mm] flex-col gap-3 rounded-[20px] border border-[#D7DEE7] bg-white px-3 py-3 shadow-sm sm:mb-4 sm:flex-row sm:items-center sm:justify-between sm:px-4"
        style={previewViewportWidth ? { maxWidth: `${previewViewportWidth}px` } : undefined}
      >
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-[#667085]">ดูเอกสาร</div>
          <div className="text-[15px] font-semibold text-[#101828]">{data.document.doc_number || "เอกสาร"}</div>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-[#667085]">
            <span>ประเภท:</span>
            <div className="inline-flex rounded-md border border-[#D7DEE7] overflow-hidden">
              <button
                type="button"
                onClick={() => setCopyType("original")}
                className={`px-2.5 py-0.5 text-[10px] font-medium transition-colors ${copyType === "original" ? "bg-[#378ADD] text-white" : "bg-white text-[#475467] hover:bg-gray-50"}`}
              >
                ต้นฉบับ
              </button>
              <button
                type="button"
                onClick={() => setCopyType("copy")}
                className={`px-2.5 py-0.5 text-[10px] font-medium transition-colors border-l border-[#D7DEE7] ${copyType === "copy" ? "bg-[#378ADD] text-white" : "bg-white text-[#475467] hover:bg-gray-50"}`}
              >
                สำเนา
              </button>
            </div>
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
            {savingPdf ? "กำลังบันทึก..." : "ต้นฉบับ+สำเนา"}
          </Button>
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
              <PrintDocument data={data} copyType={copyType} />
            </PrintErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
