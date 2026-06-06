import { documentTypeLabel } from "../../lib/docLabels";
import { LOGO_SIZE_OPTIONS } from "../../constants";
import type { PrintDocumentData } from "../../lib/print";
import type { CopyType } from "./PrintDocument";

function getLogoPx(logoSize: string | null): number {
  return LOGO_SIZE_OPTIONS.find(o => o.value === logoSize)?.px ?? 64;
}

function formatDate(date: string | null | undefined) {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  const d = parsed.getDate().toString().padStart(2, "0");
  const m = (parsed.getMonth() + 1).toString().padStart(2, "0");
  const y = parsed.getFullYear();
  return `${d}/${m}/${y}`;
}

export function PrintHeader({ data, copyType = "original" }: { data: PrintDocumentData; copyType?: CopyType }) {
  const { clientProfile, customer, document, referenceDoc } = data;
  const label = documentTypeLabel(document.doc_type, document.vat_registered);
  const copyLabel = copyType === "copy" ? "สำเนา" : "ต้นฉบับ";

  return (
    <header className="print-header bg-white text-[#1F2937] border-transparent print-modern-header px-2 pb-5 pt-3">
      <div className="flex justify-between gap-4 items-start">
        <div className="min-w-0 flex-1">
          {clientProfile.logo_url ? (
            <img
              src={clientProfile.logo_url}
              alt={clientProfile.company_name_th}
              style={{ width: getLogoPx(clientProfile.logo_size) }}
              className="mb-2 block"
            />
          ) : null}
          <h1 className="text-[18px] font-semibold tracking-tight text-[#243043] leading-tight">
            {clientProfile.company_name_th}
          </h1>

          {clientProfile.address ? (
            <p className="mt-1 max-w-[90mm] whitespace-pre-line text-[11px] leading-[18px] text-[#4F5B6E]">
              {clientProfile.address}
            </p>
          ) : null}

          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0 text-[11px] text-[#475467]">
            {clientProfile.tax_id ? <div>เลขประจำตัวผู้เสียภาษี: {clientProfile.tax_id}</div> : null}
            {clientProfile.phone ? <div>โทร: {clientProfile.phone}</div> : null}
          </div>
        </div>

        <div className="shrink-0 text-right text-[#111827] w-[64mm] p-0">
          <div className="text-[9px] tracking-[0.18em] text-[#7A8699]">{copyLabel}</div>
          <div className="mt-1 text-[26px] font-semibold tracking-[-0.02em] leading-tight text-[#111827]">
            {label.thai}
          </div>

          <div className="mt-3 space-y-1 text-[11px]">
            <div className="flex justify-between gap-2">
              <span className="text-[#6B7280]">เลขที่เอกสาร</span>
              <span className="text-right font-medium text-[#111827]">{document.doc_number || "-"}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#6B7280]">วันที่</span>
              <span className="text-right text-[#111827]">{formatDate(document.issue_date)}</span>
            </div>
            {document.due_date ? (
              <div className="flex justify-between gap-2">
                <span className="text-[#6B7280]">ครบกำหนด</span>
                <span className="text-right text-[#111827]">{formatDate(document.due_date)}</span>
              </div>
            ) : null}
            {referenceDoc?.doc_number ? (
              <div className="flex justify-between gap-2">
                <span className="text-[#6B7280]">{(() => {
                  if (document.doc_type === "receipt") {
                    if (referenceDoc.doc_type === "invoice") return "อ้างอิงใบแจ้งหนี้";
                    if (referenceDoc.doc_type === "tax_invoice_receipt") return "อ้างอิงใบกำกับภาษี";
                    if (referenceDoc.doc_type === "billing_note") return "อ้างอิงใบวางบิล";
                  }
                  return "เอกสารอ้างอิง";
                })()}</span>
                <span className="text-right text-[#111827]">{referenceDoc.doc_number}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 border border-[#E8ECF2] bg-[#F8FAFC] px-2 py-3">
        <div className="text-[10px] tracking-[0.12em] text-[#6B7280]">ลูกค้า</div>
        <div className="mt-1 font-semibold text-[13px]">{customer.name}</div>
        <div className="mt-1 space-y-0.5 text-[11px] text-[#475467]">
          {customer.tax_id ? <div>เลขประจำตัวผู้เสียภาษี: {customer.tax_id}</div> : null}
          {customer.address ? <div className="whitespace-pre-line leading-[18px]">{customer.address}</div> : null}
          {customer.phone ? <div>โทร: {customer.phone}</div> : null}
        </div>
      </div>
    </header>
  );
}
