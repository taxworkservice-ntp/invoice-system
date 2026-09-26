import { DOC_TYPE_LABELS, STATUS_COLORS, STATUS_LABELS } from "../../../constants";
import { Card } from "../../ui/Card";
import { SortableTh } from "../../ui/SortableTh";
import { TABLE } from "../../../lib/tableStyles";
import { useTableSort } from "../../ui/useTableSort";
import type { Document } from "../../../types";
import { SectionHeader } from "./shared";

type AdminDocSortKey = "doc_number" | "doc_type" | "total_amount" | "status";

export function DocumentsTab({ documents }: { documents: Document[] }) {
  const adminDocSort = useTableSort<Document, AdminDocSortKey>(documents, {
    key: "doc_number",
    dir: "asc",
  });

  return (
    <div className="space-y-4">
      <div>
        <SectionHeader>
          เอกสารล่าสุด ({documents.length >= 10 ? "10+" : documents.length} รายการ)
        </SectionHeader>
        <Card>
          {documents.length === 0 ? (
            <p className="text-body text-ink-400 text-center py-4">ยังไม่มีเอกสาร</p>
          ) : (
            <div className="overflow-x-auto">
              <table className={TABLE.table}>
                <thead>
                  <tr className={TABLE.theadTr}>
                    <SortableTh
                      label="เลขที่"
                      align="left"
                      active={adminDocSort.sort.key === "doc_number"}
                      dir={adminDocSort.sort.dir}
                      onClick={() => adminDocSort.handleSort("doc_number")}
                      className={`${TABLE.thSortable} !py-2 !pr-2 !pl-0`}
                    />
                    <SortableTh
                      label="ประเภท"
                      align="left"
                      active={adminDocSort.sort.key === "doc_type"}
                      dir={adminDocSort.sort.dir}
                      onClick={() => adminDocSort.handleSort("doc_type")}
                      className={`${TABLE.thSortable} !py-2 !pr-2 !pl-0`}
                    />
                    <th className={`${TABLE.thStatic} text-left`}>ลูกค้า</th>
                    <SortableTh
                      label="ยอดรวม"
                      align="right"
                      active={adminDocSort.sort.key === "total_amount"}
                      dir={adminDocSort.sort.dir}
                      onClick={() => adminDocSort.handleSort("total_amount")}
                      className={`${TABLE.thSortable} !py-2 !pr-2 !pl-0`}
                    />
                    <SortableTh
                      label="สถานะ"
                      align="left"
                      active={adminDocSort.sort.key === "status"}
                      dir={adminDocSort.sort.dir}
                      onClick={() => adminDocSort.handleSort("status")}
                      className="!text-ink-300 !text-label !font-normal !py-2 !pl-0"
                    />
                  </tr>
                </thead>
                <tbody>
                  {adminDocSort.sorted.map((document) => (
                    <tr key={document.id} className={`${TABLE.tbodyTr}`}>
                      <td className="py-2 pr-2 font-medium text-ink-900">
                        {document.doc_number || "-"}
                      </td>
                      <td className="py-2 pr-2 text-ink-500">
                        {DOC_TYPE_LABELS[document.doc_type]?.th || document.doc_type}
                      </td>
                      <td className="py-2 pr-2 text-ink-400">
                        {(document as any).customer?.name || "-"}
                      </td>
                      <td className="py-2 pr-2 text-right">
                        ฿{" "}
                        {document.total_amount.toLocaleString("th-TH", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-2">
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded text-label font-medium ${STATUS_COLORS[document.status]?.bg || "bg-draft-bg"} ${STATUS_COLORS[document.status]?.text || "text-ink-700"}`}
                        >
                          {STATUS_LABELS[document.status] || document.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
