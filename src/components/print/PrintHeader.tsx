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
    <header className="print-header bg-white text-[#1F2937] border-transparent print-modern-header px-0 pb-3 pt-2">
      <div className="flex gap-4 items-start">
        <div className="min-w-0 flex-1 px-2">
          {clientProfile.logo_url ? (
            <img
              src={clientProfile.logo_url}
              alt={clientProfile.company_name_th}
              style={{ width: getLogoPx(clientProfile.logo_size) }}
              className="mb-2 block"
            />
          ) : null}
          <h1 className="text-[15px] font-semibold tracking-tight text-[#243043] leading-tight">
            {clientProfile.company_name_th}
          </h1>
          {clientProfile.company_name_en ? (
            <div className="text-[8.5px] font-semibold text-[#6B7280] tracking-wide">
              {clientProfile.company_name_en.toUpperCase()}
            </div>
          ) : null}

          {clientProfile.address ? (
            <p className="mt-1 max-w-full whitespace-pre-line text-[10px] leading-[15px] text-[#4F5B6E]">
              {clientProfile.address}
            </p>
          ) : null}

          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0 text-[9.5px] text-[#475467]">
            {clientProfile.tax_id ? <div>เลขประจำตัวผู้เสียภาษี: {clientProfile.tax_id}</div> : null}
            {clientProfile.phone ? <div>โทร: {clientProfile.phone}</div> : null}
          </div>

          <div className="mt-3 border-l-2 pl-3" style={{ borderColor: "var(--doc-accent, #2f6fed)" }}>
            <div>
              <div className="text-[9px] tracking-[0.12em] text-[#6B7280]">ลูกค้า</div>
              <div className="text-[6.5px] text-[#94a3b8]">BILL TO</div>
            </div>
            <div className="mt-0.5 font-semibold text-[12px]">{customer.name}</div>
            <div className="mt-0.5 space-y-0.5 text-[9.5px] text-[#475467]">
              {customer.tax_id ? <div>เลขประจำตัวผู้เสียภาษี: {customer.tax_id}</div> : null}
              {customer.address ? <div className="whitespace-pre-line leading-[15px]">{customer.address}</div> : null}
              {customer.phone ? <div>โทร: {customer.phone}</div> : null}
            </div>
          </div>
        </div>

        <div className="shrink-0 text-right text-[#111827] w-[64mm] px-2">
          <div className="text-[9px] tracking-[0.18em] text-[#7A8699]">{copyLabel}</div>
          {document.doc_type === "tax_invoice_receipt" && document.vat_registered ? (
            <>
              <div className="mt-1 font-semibold tracking-[-0.02em] leading-tight text-[#111827]">
                <div className="text-[22px]">ใบกำกับภาษี /</div>
                <div className="text-[22px]">ใบเสร็จรับเงิน</div>
              </div>
              <div className="text-[7px] font-semibold tracking-[0.04em] text-[#94a3b8]">
                TAX INVOICE / RECEIPT
              </div>
            </>
          ) : (
            <>
              <div className="mt-1 text-[22px] font-semibold tracking-[-0.02em] leading-tight text-[#111827]">
                {label.thai}
              </div>
              <div className="text-[7px] font-semibold tracking-[0.04em] text-[#94a3b8]">
                {label.en.toUpperCase()}
              </div>
            </>
          )}

          <div className="mt-2 space-y-1 text-[10px] text-left">
            <div className="flex justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-[#6B7280]">เลขที่เอกสาร</span>
                <span className="text-[6.5px] text-[#94a3b8]">DOCUMENT NO.</span>
              </div>
              <span className="text-right font-medium text-[#111827] self-center">{document.doc_number || "-"}</span>
            </div>
            <div className="flex justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-[#6B7280]">วันที่</span>
                <span className="text-[6.5px] text-[#94a3b8]">DATE</span>
              </div>
              <span className="text-right text-[#111827] self-center">{formatDate(document.issue_date)}</span>
            </div>
            {document.due_date ? (
              <div className="flex justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-[#6B7280]">ครบกำหนด</span>
                  <span className="text-[6.5px] text-[#94a3b8]">DUE DATE</span>
                </div>
                <span className="text-right text-[#111827] self-center">{formatDate(document.due_date)}</span>
              </div>
            ) : null}
            {referenceDoc?.doc_number ? (
              <div className="flex justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-[#6B7280]">{(() => {
                    if (document.doc_type === "receipt") {
                      if (referenceDoc.doc_type === "invoice") return "อ้างอิงใบแจ้งหนี้";
                      if (referenceDoc.doc_type === "tax_invoice_receipt") {
                        return referenceDoc.vat_registered ? "อ้างอิงใบกำกับภาษี" : "อ้างอิงใบเสร็จรับเงิน";
                      }
                      if (referenceDoc.doc_type === "billing_note") return "อ้างอิงใบวางบิล";
                    }
                    return "เอกสารอ้างอิง";
                  })()}</span>
                  <span className="text-[6.5px] text-[#94a3b8]">REFERENCE</span>
                </div>
                <span className="text-right text-[#111827] self-center">{referenceDoc.doc_number}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
