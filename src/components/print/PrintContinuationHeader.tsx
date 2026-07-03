import { documentTypeLabel } from "../../lib/docLabels";
import type { PrintDocumentData } from "../../lib/print";

function formatDate(date: string | null | undefined) {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  const d = parsed.getDate().toString().padStart(2, "0");
  const m = (parsed.getMonth() + 1).toString().padStart(2, "0");
  const y = parsed.getFullYear();
  return `${d}/${m}/${y}`;
}

export function PrintContinuationHeader({
  data,
  pageIndex,
  totalPages,
}: {
  data: PrintDocumentData;
  pageIndex: number;
  totalPages: number;
}) {
  const { clientProfile, document, customer } = data;
  const label = documentTypeLabel(document.doc_type, document.vat_registered);

  return (
    <header className="print-continuation-header flex items-center justify-between border-b-[0.5px] border-[#D3DAE6] pb-1.5">
      <div className="flex items-center gap-3 min-w-0">
        <div>
          <div className="text-[11px] font-semibold text-[#243043] leading-tight">
            {clientProfile.company_name_th}
          </div>
          <div className="text-[7.5px] text-[#6B7280]">
            {label.thai}{" │ "}
            {document.doc_number || "-"}
          </div>
        </div>
        <div className="text-[8px] text-[#667085] leading-tight min-w-0 truncate border-l-[0.5px] border-[#D3DAE6] pl-3">
          <span className="text-[#94a3b8]">BILL TO </span>
          {customer.name}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 text-[8px] text-[#667085]">
        <div className="text-[#94a3b8]">
          <span className="text-[9px] font-semibold text-[#378ADD]">หน้ำ {pageIndex}</span>
          {" / "}{totalPages}
        </div>
      </div>
    </header>
  );
}
