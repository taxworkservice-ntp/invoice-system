import { formatCurrency } from "../../lib/format";
import type { PrintAppendixData } from "../../lib/print";

export function PrintAppendix({
  data,
  template,
}: {
  data: PrintAppendixData;
  template: "modern" | "classic" | "classic_v2";
}) {
  if (!data.enabled || data.groups.length === 0) return null;

  return (
    <div className={`print-appendix print-appendix-${template}`}>
      <div className="print-appendix-head">
        <div className="print-appendix-title">ภาคผนวก: รายละเอียดการส่งของ</div>
        <div className="print-appendix-subtitle">APPENDIX: DELIVERY DETAILS</div>
      </div>

      {data.groups.map((group) => (
        <div key={group.dnNumber} className="print-appendix-group">
          <div className="print-appendix-group-head">
            <span className="print-appendix-dn">ใบส่งของ {group.dnNumber}</span>
            {group.issueDate && <span className="print-appendix-date">วันที่ส่งของ {group.issueDate}</span>}
          </div>
          <table className="print-table w-full">
            <thead>
              <tr>
                <th className="text-left">รายการ</th>
                <th className="text-center">หน่วย</th>
                <th className="text-right">ส่งแล้ว</th>
                <th className="text-right">เรียกเก็บ</th>
                <th className="text-right">ราคา/หน่วย</th>
                <th className="text-right">รวม</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map((item) => (
                <tr key={item.id}>
                  <td className="text-left">{item.item_name}</td>
                  <td className="text-center">{item.unit}</td>
                  <td className="text-right">{item.deliveredQty}</td>
                  <td className="text-right">{item.billedQty}</td>
                  <td className="text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="text-right">{formatCurrency(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
