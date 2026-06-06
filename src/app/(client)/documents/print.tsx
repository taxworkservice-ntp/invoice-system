import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { PrintDocument } from "../../../components/print/PrintDocument";
import { PrintErrorBoundary } from "../../../components/print/PrintErrorBoundary";
import { getPrintDocumentData, type PrintDocumentData } from "../../../lib/print";

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
        return;
      }

      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const availableWidth = Math.max(280, viewportWidth - 16);
      const frameWidth = Math.min(frame.clientWidth || availableWidth, availableWidth);
      const sheetWidth = sheet.scrollWidth;
      const sheetHeight = sheet.scrollHeight;
      if (!frameWidth || !sheetWidth || !sheetHeight) return;

      const scale = Math.min(1, frameWidth / sheetWidth);
      setPreviewScale(scale);
      setPreviewHeight(sheetHeight * scale);
      setPreviewViewportWidth(availableWidth);
    }

    updatePreviewScale();
    window.addEventListener("resize", updatePreviewScale);
    window.visualViewport?.addEventListener("resize", updatePreviewScale);

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => updatePreviewScale())
        : null;

    if (observer && previewFrameRef.current) observer.observe(previewFrameRef.current);
    if (observer && previewSheetRef.current) observer.observe(previewSheetRef.current);

    return () => {
      window.removeEventListener("resize", updatePreviewScale);
      window.visualViewport?.removeEventListener("resize", updatePreviewScale);
      observer?.disconnect();
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

  function handleSavePdf() {
    void openBrowserPrintDialog();
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
          <div className="mt-1 text-[11px] text-[#667085]">เลือกพิมพ์หรือบันทึกเป็น PDF ได้จากปุ่มด้านขวา</div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <Button variant="secondary" onClick={() => navigate(-1)} className="flex-1 sm:flex-none">
            กลับ
          </Button>
          <Button variant="secondary" onClick={handlePrint} className="flex-1 sm:flex-none">
            พิมพ์
          </Button>
          <Button onClick={handleSavePdf} className="w-full sm:w-auto">
            บันทึกเป็น PDF
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
            style={{ transform: `scale(${previewScale})` }}
          >
            <PrintErrorBoundary onError={() => {}}>
              <PrintDocument data={data} />
            </PrintErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
