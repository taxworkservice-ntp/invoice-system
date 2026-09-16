import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "../../lib/format";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { SortableTh } from "../ui/SortableTh";
import { useTableSort } from "../ui/useTableSort";
import type { Transaction } from "../../hooks/useReports";

type SortKey = "date" | "doc_number" | "doc_type" | "customer_name" | "subtotal" | "vat_amount" | "total_amount" | "wht_amount" | "net_payable" | "paid_at" | "status";

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
  { key: "wht_amount", label: "หัก ณ ที่จ่าย", align: "right" },
  { key: "net_payable", label: "ยอดสุทธิ", align: "right" },
  { key: "paid_at", label: "วันที่ชำระ", align: "left" },
  { key: "status", label: "สถานะ", align: "left" },
];

function formatDateThai(iso: string) {
  if (!iso) return "-";
  const dateStr = iso.slice(0, 10);
  const [y, m, d] = dateStr.split("-");
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
      <EmptyState title="ไม่มีรายการ" description="ยังไม่มีรายการในช่วงนี้" />
    );
  }

  function getCellValue(t: Transaction, key: SortKey): string {
    switch (key) {
      case "date": return formatDateThai(t.date);
      case "subtotal": case "vat_amount": case "total_amount": case "wht_amount": case "net_payable":
        return formatCurrency(Number(t[key]));
      case "status":
        return t.status;
      case "paid_at":
        return t.paid_at ? formatDateThai(t.paid_at) : "-";
      default:
        return String(t[key] || "-");
    }
  }

  return (
    <Card className="border-[0.5px] overflow-x-auto">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h3 className="text-label font-semibold text-ink-500">รายการแยกตามธุรกรรม</h3>
        <span className="text-label text-ink-400">{sorted.length} รายการ</span>
      </div>
      <table className="w-full text-label">
        <thead>
          <tr className="border-b border-line bg-paper-field">
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
              className="border-b border-line hover:bg-paper-field cursor-pointer transition-colors"
            >
              {COLUMNS.map((col) => {
                if (col.key === "status") {
                  return (
                    <td key={col.key} className="px-3 py-2 text-left whitespace-nowrap">
                      <span className={`text-label px-1.5 py-0.5 rounded font-medium ${t.is_paid ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                        {t.status}
                      </span>
                    </td>
                  );
                }
                const val = getCellValue(t, col.key);
                const isMoney = col.key === "subtotal" || col.key === "vat_amount" || col.key === "total_amount" || col.key === "wht_amount" || col.key === "net_payable";
                return (
                  <td
                    key={col.key}
                    className={`px-3 py-2 text-${col.align} whitespace-nowrap tabular-nums ${col.key === "total_amount" || col.key === "net_payable" ? "font-medium text-ink-900" : "text-ink-500"} ${col.key === "customer_name" ? "max-w-[140px] truncate" : ""}`}
                  >
                    {isMoney ? `฿${val}` : val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-[1.5px] border-line-strong bg-paper-field font-semibold text-ink-900">
            <td className="px-3 py-2 text-left" colSpan={4}>รวม</td>
            <td className="px-3 py-2 text-right tabular-nums">฿{formatCurrency(totals.subtotal)}</td>
            <td className="px-3 py-2 text-right tabular-nums">฿{formatCurrency(totals.vat_amount)}</td>
            <td className="px-3 py-2 text-right tabular-nums">฿{formatCurrency(totals.total_amount)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-danger">฿{formatCurrency(totals.wht_amount)}</td>
            <td className="px-3 py-2 text-right tabular-nums">฿{formatCurrency(totals.net_payable)}</td>
            <td className="px-3 py-2"></td>
            <td className="px-3 py-2"></td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}
