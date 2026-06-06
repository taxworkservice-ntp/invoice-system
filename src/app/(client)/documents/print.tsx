import { useEffect, useState } from "react";
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
        const message = err instanceof Error ? err.message : "Unable to open print preview.";
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
          <h1 className="text-[24px] font-semibold text-[#101828]">Print preview unavailable</h1>
          <p className="mt-3 text-[14px] text-[#475467]">{error || "Unable to prepare this document for print preview."}</p>
          <div className="mt-6">
            <Button variant="secondary" onClick={() => navigate(-1)}>
              Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="print-preview-shell min-h-screen bg-[#EEF2F6] px-4 py-6">
      <div className="print-toolbar mx-auto mb-4 flex max-w-[230mm] items-center justify-between gap-3 rounded-[20px] border border-[#D7DEE7] bg-white px-4 py-3 shadow-sm">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-[#667085]">Print Preview</div>
          <div className="text-[15px] font-semibold text-[#101828]">{data.document.doc_number || "Document"}</div>
          <div className="mt-1 text-[11px] text-[#667085]">เลือกพิมพ์หรือบันทึกเป็น PDF ได้จากปุ่มด้านขวา</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Back
          </Button>
          <Button variant="secondary" onClick={handlePrint}>
            พิมพ์
          </Button>
          <Button onClick={handleSavePdf}>
            บันทึกเป็น PDF
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-[230mm]">
        <PrintErrorBoundary onError={() => {}}>
          <PrintDocument data={data} />
        </PrintErrorBoundary>
      </div>
    </div>
  );
}
