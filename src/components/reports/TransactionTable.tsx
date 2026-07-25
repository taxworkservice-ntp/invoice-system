import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "../../lib/format";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { SortableTh } from "../ui/SortableTh";
import { useTableSort } from "../ui/useTableSort";
import type { Transaction } from "../../hooks/useReports";

type SortKey = "date" | "doc_number" | "doc_type" | "customer_name" | "subtotal" | "vat_amount" | "total_amount" | "wht_amount" | "net_payable" | "status";

interface Props {
  transactions: Transaction[];
}

const COLUMNS: { key: SortKey; label: string; align: "left" | "right"; className?: string }[] = [
  { key: "date", label: "วันที่", align: "left" },
  { key: "doc_number", label: "เลขที่", align: "left" },
  { key: "doc_type", label: "ประเภท", align: "left" },
  { key: "customer_name", label: "ลูกค้า", align: "left", className: "max-w-[120px] truncate" },
  { key: "subtotal", label: "ก่อน VAT", align: "right" },
  { key: "vat_amount", label: "VAT", align: "right" },
  { key: "total_amount", label: "ยอดรวม", align: "right" },
  { key: "wht_amount", label: "WHT", align: "right" },
  { key: "net_payable", label: "ยอดสุทธิ", align: "right" },
  { key: "status", label: "สถานะ", align: "left" },
];

function formatDateThai(iso: string) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${Number(y) + 543}`;
}

export function TransactionTable({ transactions }: Props) {
  const navigate = useNavigate();
  const { sort, handleSort, sorted } = useTableSort<Transaction, SortKey>(transactions, {
    key: "date",
    dir: "desc",
  });

  const totals = useMemo(() => ({
    subtotal: sorted.reduce((s, t) => s + t.subtotal, 0),
    vat_amount: sorted.reduce((s, t) => s + t.vat_amount, 0),
    total_amount: sorted.reduce((s, t) => s + t.total_amount, 0),
    wht_amount: sorted.reduce((s, t) => s + t.wht_amount, 0),
    net_payable: sorted.reduce((s, t) => s + t.net_payable, 0),
  }), [sorted]);

  if (transactions.length === 0) {
    return (
      <EmptyState title="ไม่มีรายการ" description="ยังไม่มีรายการที่ชำระเงินในเดือนนี้" />
    );
  }

  function getCellValue(t: Transaction, key: SortKey): string {
    switch (key) {
      case "date": return formatDateThai(t.date);
      case "subtotal": case "vat_amount": case "total_amount": case "wht_amount": case "net_payable":
        return formatCurrency(Number(t[key]));
      case "status":
        return t.status;
      default:
        return String(t[key] || "-");
    }
  }

  return (
    <Card className="border-[0.5px] shadow-sm overflow-x-auto">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.05em] text-gray-500">รายการแยกตามธุรกรรม</h3>
        <span className="text-[11px] text-gray-400">{sorted.length} รายการ</span>
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-[#E6EBF2] bg-[#F4F7FB]">
            {COLUMNS.map((col) => (
              <SortableTh
                key={col.key}
                label={col.label}
                align={col.align}
                active={sort.key === col.key}
                dir={sort.dir}
                onClick={() => handleSort(col.key)}
                className={col.className || ""}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr
              key={t.id}
              onClick={() => navigate(t.deal_id ? `/deals/${t.deal_id}` : `/documents/${t.id}`)}
              className="border-b border-[#E6EBF2] hover:bg-[#F8FAFC] cursor-pointer transition-colors"
            >
              {COLUMNS.map((col) => {
                if (col.key === "status") {
                  return (
                    <td key={col.key} className="px-3 py-2 text-left whitespace-nowrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${t.is_paid ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                        {t.status}
                      </span>
                    </td>
                  );
                }
                const val = getCellValue(t, col.key);
                return (
                  <td
                    key={col.key}
                    className={`px-3 py-2 text-${col.align} whitespace-nowrap ${col.key === "total_amount" || col.key === "net_payable" ? "font-medium text-[#111827]" : "text-[#475467]"} ${col.key === "customer_name" ? "max-w-[140px] truncate" : ""}`}
                  >
                    {val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-[1.5px] border-[#C9D5E3] bg-[#F8FAFC] font-semibold text-[#111827]">
            <td className="px-3 py-2 text-left" colSpan={4}>รวม</td>
            <td className="px-3 py-2 text-right">{formatCurrency(totals.subtotal)}</td>
            <td className="px-3 py-2 text-right">{formatCurrency(totals.vat_amount)}</td>
            <td className="px-3 py-2 text-right">{formatCurrency(totals.total_amount)}</td>
            <td className="px-3 py-2 text-right text-[#C0392B]">{formatCurrency(totals.wht_amount)}</td>
            <td className="px-3 py-2 text-right">{formatCurrency(totals.net_payable)}</td>
            <td className="px-3 py-2"></td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}
