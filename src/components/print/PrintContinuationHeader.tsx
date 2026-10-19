import { printTitle } from "../../lib/docLabels";
import type { PrintDocumentData } from "../../lib/print";

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
  const label = printTitle(document);

  return (
    <header className="print-continuation-header flex items-center justify-between border-b-[0.5px] border-[#D3DAE6] pb-1.5">
      <div className="flex items-center gap-3 min-w-0">
        <div>
          <div className="text-[calc(11px*var(--modern-fs-header-company))] font-semibold text-[#243043] leading-tight">
            {clientProfile.company_name_th}
          </div>
          <div className="text-[calc(7.5px*var(--modern-fs-header-title))] text-[#1F2937]">
            {label.thai}{" │ "}
            {document.doc_number || "-"}
          </div>
        </div>
        <div className="text-[calc(8px*var(--modern-fs-header-info))] text-[#1F2937] leading-tight min-w-0 truncate border-l-[0.5px] border-[#D3DAE6] pl-3">
          <span className="text-[#475467]">BILL TO </span>
          {customer.name}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 text-[calc(8px*var(--modern-fs-header-info))] text-[#1F2937]">
        <div className="text-[#475467]">
          <span className="text-[calc(9px*var(--modern-fs-header-info))] font-semibold text-[#378ADD]">หน้า {pageIndex}</span>
          {" / "}{totalPages}
        </div>
      </div>
    </header>
  );
}
