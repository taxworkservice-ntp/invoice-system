import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "../../../components/layout/AppShell";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useDocuments } from "../../../hooks/useDocuments";
import { useAuth } from "../../../hooks/useAuth";
import { DOC_TYPE_LABELS, STATUS_LABELS, DOC_TYPE_COLORS } from "../../../constants";
import { documentTypeLabel } from "../../../lib/docLabels";
import { formatBuddhistDate } from "../../../lib/dates";
import { formatCurrency } from "../../../lib/format";
import type { DocumentType, DocumentStatus } from "../../../types";

const DOC_TYPE_FILTERS: { label: string; value: DocumentType | "all" }[] = [
  { label: "ทั้งหมด", value: "all" },
  { label: "ใบเสนอราคา", value: "quotation" },
  { label: "ใบแจ้งหนี้", value: "invoice" },
  { label: "ใบกำกับภาษี/ใบเสร็จรับเงิน", value: "tax_invoice_receipt" },
  { label: "ใบวางบิล", value: "billing_note" },
  { label: "ใบเสร็จรับเงิน", value: "receipt" },
  { label: "ใบส่งของ", value: "delivery_note" },
  { label: "ใบลดหนี้", value: "credit_note" },
];

const STATUS_FILTERS: { label: string; value: DocumentStatus | "all" }[] = [
  { label: "ทั้งหมด", value: "all" },
  { label: "ร่าง", value: "draft" },
  { label: "ส่งแล้ว", value: "sent" },
  { label: "แปลงแล้ว", value: "converted" },
  { label: "รอวางบิล", value: "in_billing" },
  { label: "ชำระแล้ว", value: "paid" },
  { label: "เกินกำหนด", value: "overdue" },
  { label: "ออกแล้ว", value: "generated" },
  { label: "ยกเลิก", value: "voided" },
];

function DocTypeBadge({ docType, vatRegistered = false }: { docType: DocumentType; vatRegistered?: boolean }) {
  const color = DOC_TYPE_COLORS[docType];
  const label = documentTypeLabel(docType, vatRegistered);
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${color.bg} ${color.text}`}>
      {label.thai}
    </span>
  );
}

export default function DocumentsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const { documents, loading } = useDocuments(profile?.id);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchDebouncing, setSearchDebouncing] = useState(false);
  const [docTypeFilter, setDocTypeFilter] = useState<DocumentType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const preset = searchParams.get("preset");

  useEffect(() => {
    if (preset === "overdue") {
      setDocTypeFilter("billing_note");
      setStatusFilter("overdue");
      return;
    }
    if (preset === "unpaid") {
      setDocTypeFilter("billing_note");
      setStatusFilter("all");
      return;
    }
    if (preset === "paid_this_month") {
      setDocTypeFilter("billing_note");
      setStatusFilter("paid");
    }
  }, [preset]);

  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSearchDebouncing(true);
    timerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setSearchDebouncing(false);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [search]);

  const filtered = useMemo(() => {
    return documents.filter((doc) => {
      if (docTypeFilter !== "all" && doc.doc_type !== docTypeFilter) return false;
      if (statusFilter !== "all" && doc.status !== statusFilter) return false;
      if (preset === "unpaid" && (doc.doc_type !== "billing_note" || !["sent", "overdue"].includes(doc.status))) return false;
      if (preset === "paid_this_month") {
        if (doc.doc_type !== "billing_note" || doc.status !== "paid" || !doc.paid_at) return false;
        const paidAt = new Date(doc.paid_at);
        const now = new Date();
        if (paidAt.getMonth() !== now.getMonth() || paidAt.getFullYear() !== now.getFullYear()) return false;
      }
      if (debouncedSearch) {
        const query = debouncedSearch.toLowerCase();
        const customerName = ((doc as any).customer?.name || "").toLowerCase();
        const docNumber = (doc.doc_number || "").toLowerCase();
        if (!customerName.includes(query) && !docNumber.includes(query)) return false;
      }
      if (dateFrom && doc.issue_date < dateFrom) return false;
      if (dateTo && doc.issue_date > dateTo) return false;
      return true;
    });
  }, [documents, docTypeFilter, statusFilter, debouncedSearch, dateFrom, dateTo, preset]);

  const hasFilters = docTypeFilter !== "all" || statusFilter !== "all" || dateFrom || dateTo || debouncedSearch;

  function clearFilters() {
    setSearch("");
    setDocTypeFilter("all");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
  }

  function handleExportCSV() {
    const headers = ["เลขที่เอกสาร", "ประเภท", "สถานะ", "ลูกค้า", "วันที่ออก", "วันครบกำหนด", "ยอดสุทธิ"];
    const rows = filtered.map((doc) => [
      doc.doc_number || "",
      DOC_TYPE_LABELS[doc.doc_type].th,
      STATUS_LABELS[doc.status],
      (doc as any).customer?.name || "",
      doc.issue_date,
      doc.due_date || "",
      doc.net_payable.toString(),
    ]);
    const csv = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `documents_export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell title="เอกสาร">
      <div className="space-y-4">
        <Input
          id="search"
          placeholder="ค้นหาชื่อลูกค้า หรือเลขที่เอกสาร..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {searchDebouncing && (
          <div className="-mt-3 mb-1 flex justify-end">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        <div className="flex gap-2">
          <Input id="dateFrom" type="date" label="จากวันที่" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <Input id="dateTo" type="date" label="ถึงวันที่" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {DOC_TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setDocTypeFilter(filter.value)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                docTypeFilter === filter.value
                  ? "border-primary bg-primary text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                statusFilter === filter.value
                  ? "border-gray-700 bg-gray-700 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="secondary" size="sm" onClick={handleExportCSV}>
            ส่งออก CSV
          </Button>
          <div className="flex items-center gap-2">
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-primary hover:underline">
                ล้างตัวกรอง
              </button>
            )}
            <span className="text-xs text-gray-500">
              {filtered.length} จาก {documents.length} รายการ
            </span>
          </div>
        </div>

        {loading ? (
          <SkeletonTable />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="ไม่พบเอกสาร"
            description={documents.length === 0 ? "ยังไม่มีเอกสารในระบบ" : "ลองเปลี่ยนคำค้นหา หรือปรับตัวกรอง"}
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((doc) => {
              const isOverdue = doc.due_date && doc.status === "sent" && new Date(doc.due_date) < new Date();
              return (
                <Card key={doc.id} onClick={() => navigate(`/documents/${doc.id}`)} className="cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">{doc.doc_number || "-"}</span>
                        <DocTypeBadge docType={doc.doc_type} vatRegistered={doc.vat_registered} />
                        <Badge status={doc.status} />
                        {isOverdue && (
                          <span className="inline-flex rounded-md bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                            เกินกำหนด
                          </span>
                        )}
                      </div>
                      <p className="truncate text-sm text-gray-600">{(doc as any).customer?.name || "ไม่ระบุลูกค้า"}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{formatBuddhistDate(doc.issue_date)}</span>
                        {doc.due_date && (
                          <span className={isOverdue ? "font-medium text-red-600" : ""}>
                            ครบกำหนด: {formatBuddhistDate(doc.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ml-3 flex-shrink-0 text-right">
                      <span className="text-sm font-semibold text-gray-800">฿ {formatCurrency(doc.net_payable)}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
