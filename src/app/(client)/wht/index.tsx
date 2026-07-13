import { useState, useMemo, useEffect } from "react";
import { Download, Trash2, Plus, FileText, Users, Eye, EyeOff } from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { SearchInput } from "../../../components/ui/SearchInput";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ViewToggle } from "../../../components/ui/ViewToggle";
import type { ViewMode } from "../../../components/ui/ViewToggle";
import { SortableTh } from "../../../components/ui/SortableTh";
import { useTableSort } from "../../../components/ui/useTableSort";
import { useWhtRecords, type WhtRecordWithVendor } from "../../../hooks/useWhtRecords";
import { useWhtVendors } from "../../../hooks/useWhtVendors";
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { formatCurrency } from "../../../lib/format";
import { supabase } from "../../../lib/supabase";
import type { WhtVendor, WhtFormType } from "../../../types";

const WHT_FORM_TYPE_LABELS: Record<WhtFormType, string> = {
  pnd1: "ภ.ง.ด.1",
  pnd1_special: "ภ.ง.ด.1ก",
  pnd2: "ภ.ง.ด.2",
  pnd3: "ภ.ง.ด.3",
  pnd2a: "ภ.ง.ด.2ก",
  pnd3a: "ภ.ง.ด.3ก",
  pnd53: "ภ.ง.ด.53",
};

const WHT_FORM_TYPE_COLORS: Record<WhtFormType, string> = {
  pnd1: "#2563eb",
  pnd1_special: "#7c3aed",
  pnd2: "#dc2626",
  pnd3: "#ca8a04",
  pnd2a: "#d97706",
  pnd3a: "#0891b2",
  pnd53: "#2563eb",
};

const WHT_FORM_TYPES: WhtFormType[] = ["pnd3", "pnd53", "pnd1", "pnd2", "pnd3a", "pnd2a", "pnd1_special"];

const WHT_DESCRIPTION_PRESETS = [
  "ค่าจ้างทำของ",
  "ค่าขนส่ง",
  "ค่านายหน้า",
  "ค่าเบี้ยประกันวินาศภัย",
  "ค่าโฆษณา",
  "ค่าเช่า",
  "ค่าบริการ",
];
const TAB_RECORDS = "records" as const;
const TAB_VENDORS = "vendors" as const;
type Tab = typeof TAB_RECORDS | typeof TAB_VENDORS;

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("No active session");
  return token;
}

async function apiFetchBlob(url: string, body: unknown): Promise<Blob> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `Request failed (${res.status})`;
    try {
      const json = JSON.parse(text);
      msg = json.error || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.blob();
}

export default function WhtPage() {
  const { profile } = useAuth();
  const { clientProfile } = useClientProfile(profile?.id);
  const toast = useToast();
  const userId = profile?.id;
  const {
    records, loading: recordsLoading, addRecord, updateRecord, deleteRecord,
    assignCertificateNo, months, vendors: recordVendors,
  } = useWhtRecords(userId);
  const {
    vendors: allVendors, loading: vendorsLoading, addVendor, updateVendor, deleteVendor,
  } = useWhtVendors(userId);

  const [tab, setTab] = useState<Tab>(TAB_RECORDS);
  const [month, setMonth] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [formFilter, setFormFilter] = useState("");
  const [search, setSearch] = useState("");
  const [generating, setGenerating] = useState(false);

  const [showAddRecord, setShowAddRecord] = useState(false);
  const [showEditRecord, setShowEditRecord] = useState<WhtRecordWithVendor | null>(null);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [showEditVendor, setShowEditVendor] = useState<WhtVendor | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [saving, setSaving] = useState(false);
  const [showSig, setShowSig] = useState(true);
  const [showStp, setShowStp] = useState(true);

  useEffect(() => {
    if (clientProfile) {
      if (showSig !== clientProfile.show_signature_on_wht) setShowSig(clientProfile.show_signature_on_wht !== false);
      if (showStp !== clientProfile.show_stamp_on_wht) setShowStp(clientProfile.show_stamp_on_wht !== false);
    }
  }, [clientProfile]);

  const [newRecord, setNewRecord] = useState({
    vendor_id: "",
    form_type: "pnd3" as WhtFormType,
    issue_date: new Date().toISOString().slice(0, 10),
    amount: "",
    wht_rate: "3",
    description: "",
    note: "",
  });
  const [editRecordForm, setEditRecordForm] = useState({
    vendor_id: "",
    form_type: "pnd3" as WhtFormType,
    issue_date: "",
    amount: "",
    wht_rate: "3",
    description: "",
    note: "",
  });
  const [newVendor, setNewVendor] = useState({ name: "", tax_id: "", address: "", phone: "", email: "", contact_name: "", note: "" });
  const [editVendorForm, setEditVendorForm] = useState({ name: "", tax_id: "", address: "", phone: "", email: "", contact_name: "", note: "" });

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (month && r.issue_date && !r.issue_date.startsWith(month)) return false;
      if (vendorFilter && r.vendor_id !== vendorFilter) return false;
      if (formFilter && r.form_type !== formFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const vendor = r.vendor;
        if (!vendor?.name?.toLowerCase().includes(s) && !vendor?.tax_id?.includes(s) && !r.certificate_no?.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [records, month, vendorFilter, formFilter, search]);

  const filteredVendors = useMemo(() => {
    if (!search) return allVendors;
    const s = search.toLowerCase();
    return allVendors.filter((v) => v.name.toLowerCase().includes(s) || (v.tax_id && v.tax_id.includes(s)));
  }, [allVendors, search]);

  const summary = useMemo(() => {
    const filtered = filteredRecords;
    return {
      count: filtered.length,
      totalAmount: filtered.reduce((s, r) => s + r.amount, 0),
      totalWht: filtered.reduce((s, r) => s + r.wht_amount, 0),
      generated: filtered.filter((r) => r.certificate_no).length,
    };
  }, [filteredRecords]);

  type WhtSortKey = "issue_date" | "form_type" | "amount";
  const tableSort = useTableSort<WhtRecordWithVendor, WhtSortKey>(filteredRecords, { key: "issue_date", dir: "desc" });

  function formatDate(d: string) {
    if (!d) return "-";
    const parts = d.slice(0, 10).split("-");
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  async function handleAddRecord() {
    if (!newRecord.vendor_id || !newRecord.amount) return;
    setSaving(true);
    try {
      await addRecord({
        vendor_id: newRecord.vendor_id,
        form_type: newRecord.form_type,
        issue_date: newRecord.issue_date,
        amount: parseFloat(newRecord.amount),
        wht_rate: parseFloat(newRecord.wht_rate),
        description: newRecord.description || null,
        note: newRecord.note || null,
      });
      setShowAddRecord(false);
      setNewRecord({ vendor_id: "", form_type: "pnd3", issue_date: new Date().toISOString().slice(0, 10), amount: "", wht_rate: "3", description: "", note: "" });
      toast.success("เพิ่มรายการ WHT แล้ว");
    } catch (e: any) {
      toast.error(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateRecord() {
    if (!showEditRecord) return;
    setSaving(true);
    try {
      await updateRecord(showEditRecord.id, {
        vendor_id: editRecordForm.vendor_id || showEditRecord.vendor_id,
        form_type: editRecordForm.form_type,
        issue_date: editRecordForm.issue_date,
        amount: parseFloat(editRecordForm.amount) || showEditRecord.amount,
        wht_rate: parseFloat(editRecordForm.wht_rate),
        description: editRecordForm.description || null,
        note: editRecordForm.note || null,
      });
      setShowEditRecord(null);
      toast.success("อัปเดตรายการ WHT แล้ว");
    } catch (e: any) {
      toast.error(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  function openEditRecord(record: WhtRecordWithVendor) {
    setShowEditRecord(record);
    setEditRecordForm({
      vendor_id: record.vendor_id,
      form_type: record.form_type,
      issue_date: record.issue_date?.slice(0, 10) || "",
      amount: String(record.amount),
      wht_rate: String(record.wht_rate),
      description: record.description || "",
      note: record.note || "",
    });
  }

  async function handleDeleteRecord(id: string) {
    if (!confirm("ลบรายการ WHT นี้?")) return;
    try {
      await deleteRecord(id);
      toast.success("ลบรายการแล้ว");
    } catch (e: any) {
      toast.error(e.message || "เกิดข้อผิดพลาด");
    }
  }

  async function handleBatchGenerate() {
    const toGenerate = filteredRecords;
    if (toGenerate.length === 0) return;
    setGenerating(true);
    try {
      toast.success(`กำลังสร้าง PDF ${toGenerate.length} รายการ...`);
      await assignCertificateNo(toGenerate.filter((r) => !r.certificate_no));

      const ids = toGenerate.map((r) => r.id);
      const blob = await apiFetchBlob("/api/wht/generate", { ids, layout: "pnd", hideSignature: !showSig, hideStamp: !showStp });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "wht_certificates.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("สร้าง PDF เรียบร้อยแล้ว");
    } catch (e: any) {
      toast.error(e.message || "เกิดข้อผิดพลาดในการสร้าง PDF");
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateSingle(record: WhtRecordWithVendor) {
    setGenerating(true);
    try {
      if (!record.certificate_no) {
        await assignCertificateNo([record]);
      }

      const blob = await apiFetchBlob("/api/wht/generate", { ids: [record.id], hideSignature: !showSig, hideStamp: !showStp });

      const url = URL.createObjectURL(blob);
      const vendorName = record.vendor?.name || "vendor";
      const a = document.createElement("a");
      a.href = url;
      a.download = `${record.certificate_no || "wht"}_${vendorName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("สร้าง PDF แล้ว");
    } catch (e: any) {
      toast.error(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setGenerating(false);
    }
  }

  async function handleAddVendor() {
    if (!newVendor.name.trim() || !newVendor.tax_id.trim() || !newVendor.address.trim()) return;
    setSaving(true);
    try {
      await addVendor(newVendor);
      setShowAddVendor(false);
      setNewVendor({ name: "", tax_id: "", address: "", phone: "", email: "", contact_name: "", note: "" });
      toast.success("เพิ่มผู้ขายแล้ว");
    } catch (e: any) {
      toast.error(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateVendor() {
    if (!showEditVendor) return;
    if (!editVendorForm.name.trim() || !editVendorForm.tax_id.trim() || !editVendorForm.address.trim()) return;
    setSaving(true);
    try {
      await updateVendor(showEditVendor.id, editVendorForm);
      setShowEditVendor(null);
      toast.success("อัปเดตผู้ขายแล้ว");
    } catch (e: any) {
      toast.error(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  function openEditVendor(v: WhtVendor) {
    setShowEditVendor(v);
    setEditVendorForm({
      name: v.name,
      tax_id: v.tax_id || "",
      address: v.address || "",
      phone: v.phone || "",
      email: v.email || "",
      contact_name: v.contact_name || "",
      note: v.note || "",
    });
  }

  async function handleDeleteVendor(id: string) {
    if (!confirm("ลบผู้ขายนี้? รายการ WHT ที่เชื่อมโยงจะยังคงอยู่")) return;
    try {
      await deleteVendor(id);
      toast.success("ลบผู้ขายแล้ว");
    } catch (e: any) {
      toast.error(e.message || "เกิดข้อผิดพลาด");
    }
  }

  const availableMonths = months;

  return (
    <AppShell title="WHT ภาษีหัก ณ ที่จ่าย">
      <div className="space-y-4">
        <div className="flex gap-1 rounded-xl border border-[#E8E6DF] bg-[#FAFAF8] p-1">
          <button
            type="button"
            onClick={() => { setTab(TAB_RECORDS); setSearch(""); }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === TAB_RECORDS ? "bg-white text-[#1A1A18] shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <FileText className="h-4 w-4" />
            บันทึก WHT
          </button>
          <button
            type="button"
            onClick={() => { setTab(TAB_VENDORS); setSearch(""); }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === TAB_VENDORS ? "bg-white text-[#1A1A18] shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Users className="h-4 w-4" />
            ผู้ขาย/ผู้รับเงิน
          </button>
        </div>

        {tab === TAB_RECORDS ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="ค้นหาชื่อ เลขภาษี เลขใบรับรอง..." className="flex-1 min-w-[200px]" />
              <select value={month} onChange={(e) => setMonth(e.target.value)} className="bg-white border-[0.5px] border-[#E8E6DF] rounded-lg px-3 py-[10px] text-[13px] text-[#1A1A18] focus:outline-none focus:border-[#378ADD] [color-scheme:dark]">
                <option value="">ทุกเดือน</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className="bg-white border-[0.5px] border-[#E8E6DF] rounded-lg px-3 py-[10px] text-[13px] text-[#1A1A18] focus:outline-none focus:border-[#378ADD] [color-scheme:dark]">
                <option value="">ผู้ขายทั้งหมด</option>
                {recordVendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <select value={formFilter} onChange={(e) => setFormFilter(e.target.value)} className="bg-white border-[0.5px] border-[#E8E6DF] rounded-lg px-3 py-[10px] text-[13px] text-[#1A1A18] focus:outline-none focus:border-[#378ADD] [color-scheme:dark]">
                <option value="">ทุกแบบ</option>
                {WHT_FORM_TYPES.map((ft) => (
                  <option key={ft} value={ft}>{WHT_FORM_TYPE_LABELS[ft]}</option>
                ))}
              </select>
              <Button size="sm" onClick={() => setShowAddRecord(true)} className="!rounded-lg shrink-0">
                <Plus size={14} className="mr-1" /> เพิ่มรายการ
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {filteredRecords.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 text-[12px] text-[#888780]">
                  <span>{summary.count} รายการ</span>
                  <span>รวมเงิน {formatCurrency(summary.totalAmount)}</span>
                  <span className="text-[#C0392B]">WHT {formatCurrency(summary.totalWht)}</span>
                  <span className="text-[#378ADD]">ออกใบรับรองแล้ว {summary.generated} รายการ</span>
                </div>
              )}

              <div className="flex items-center gap-2 ml-auto">
                <span className="text-[12px] text-[#888780] mr-0.5">แสดงบนเอกสาร:</span>
                <button
                  type="button"
                  onClick={() => setShowSig(!showSig)}
                  title={`ลายเซ็น: ${showSig ? "แสดง" : "ซ่อน"} — คลิกเพื่อสลับ`}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    showSig ? "border-primary bg-primary text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {showSig ? <Eye size={15} /> : <EyeOff size={15} />}
                  ลายเซ็น
                </button>
                <button
                  type="button"
                  onClick={() => setShowStp(!showStp)}
                  title={`ตราประทับ: ${showStp ? "แสดง" : "ซ่อน"} — คลิกเพื่อสลับ`}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    showStp ? "border-primary bg-primary text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {showStp ? <Eye size={15} /> : <EyeOff size={15} />}
                  ตราประทับ
                </button>
                <div className="w-px h-6 bg-gray-200 mx-0.5" />
                <Button size="sm" variant="secondary" onClick={handleBatchGenerate} loading={generating} className="!rounded-lg">
                  <Download size={14} className="mr-1" /> ออกรายงาน PDF
                </Button>
              </div>
            </div>

            {recordsLoading ? (
              <div className="bg-white border border-card-border rounded-card overflow-hidden">
                <div className="p-4 space-y-2">
                  {[...Array(6)].map((_, i) => <div key={i} className="h-8 bg-gray-200 rounded animate-pulse" />)}
                </div>
              </div>
            ) : filteredRecords.length === 0 ? (
              records.length === 0 ? (
                <EmptyState
                  title="ยังไม่มีรายการ WHT"
                  description="เพิ่มรายการหัก ณ ที่จ่าย เพื่อออกรายงานและใบรับรอง"
                  action={<Button onClick={() => setShowAddRecord(true)}><Plus size={14} className="mr-1" /> เพิ่มรายการ WHT</Button>}
                />
              ) : (
                <div className="text-center py-12 text-[13px] text-[#888780]">
                  <p>ไม่พบรายการที่ตรงกับตัวกรอง</p>
                </div>
              )
            ) : (
              <div className="bg-white border border-card-border rounded-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-[#E8E6DF] bg-[#F7F6F3]">
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 w-[40px]">#</th>
                        <SortableTh
                          label="วันที่"
                          active={tableSort.sort.key === "issue_date"}
                          dir={tableSort.sort.dir}
                          onClick={() => tableSort.handleSort("issue_date")}
                          className="px-3 py-2"
                        />
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500">ผู้ขาย</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500">เลขภาษี</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500">รายละเอียด</th>
                        <SortableTh
                          label="แบบ"
                          active={tableSort.sort.key === "form_type"}
                          dir={tableSort.sort.dir}
                          onClick={() => tableSort.handleSort("form_type")}
                          className="px-3 py-2"
                        />
                        <SortableTh
                          label="จำนวนเงิน"
                          align="right"
                          active={tableSort.sort.key === "amount"}
                          dir={tableSort.sort.dir}
                          onClick={() => tableSort.handleSort("amount")}
                          className="px-3 py-2"
                        />
                        <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-500">WHT</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500">ใบรับรอง</th>
                        <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-500" />
                      </tr>
                    </thead>
                    <tbody>
                      {tableSort.sorted.map((r, idx) => (
                        <tr key={r.id} className="border-b border-[#F0EFE9] hover:bg-[#F7F6F3] transition-colors">
                          <td className="px-3 py-2 text-[#888780]">{idx + 1}</td>
                          <td className="px-3 py-2">{formatDate(r.issue_date)}</td>
                          <td className="px-3 py-2 font-medium">{r.vendor?.name || "-"}</td>
                          <td className="px-3 py-2 font-mono text-[12px] text-[#888780]">{r.vendor?.tax_id || "-"}</td>
                          <td className="px-3 py-2 text-[12px] text-[#555]">{r.description || "-"}</td>
                          <td className="px-3 py-2">
                            <span
                              className="px-1.5 py-0.5 rounded text-[11px] font-medium"
                              style={{ backgroundColor: `${WHT_FORM_TYPE_COLORS[r.form_type]}15`, color: WHT_FORM_TYPE_COLORS[r.form_type] }}
                            >
                              {WHT_FORM_TYPE_LABELS[r.form_type] || r.form_type}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">{formatCurrency(r.amount)}</td>
                          <td className="px-3 py-2 text-right text-[#C0392B]">{formatCurrency(r.wht_amount)}</td>
                          <td className="px-3 py-2 font-mono text-[12px]">
                            {r.certificate_no ? (
                              <span className="text-[#378ADD]">{r.certificate_no}</span>
                            ) : (
                              <span className="text-[#AAAAAA]">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <button type="button" onClick={() => handleGenerateSingle(r)} disabled={generating} className="p-1.5 rounded-md hover:bg-[#EEF2FF] text-[#378ADD] text-[11px] font-medium" title="สร้าง PDF">
                                <FileText size={14} />
                              </button>
                              <button type="button" onClick={() => openEditRecord(r)} className="p-1.5 rounded-md hover:bg-[#F7F6F3] text-[#888780] text-[11px]" title="แก้ไข">
                                แก้ไข
                              </button>
                              <button type="button" onClick={() => handleDeleteRecord(r.id)} className="p-1.5 rounded-md hover:bg-red-50 text-[#AAAAAA] hover:text-red-500" title="ลบ">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="ค้นหาชื่อ เลขผู้เสียภาษี..." className="flex-1" />
              <ViewToggle value={viewMode} onChange={setViewMode} />
              <Button size="sm" onClick={() => setShowAddVendor(true)} className="!rounded-lg shrink-0">
                <Plus size={14} className="mr-1" /> เพิ่ม
              </Button>
            </div>

            {vendorsLoading ? (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-white border border-[#E8E6DF] rounded-[10px] p-4 animate-pulse min-h-[100px]">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : filteredVendors.length === 0 ? (
              allVendors.length === 0 ? (
                <EmptyState
                  title="ยังไม่มีผู้ขาย/ผู้รับเงิน"
                  description="เพิ่มข้อมูลผู้ขายหรือผู้รับเงินที่ต้องหักภาษี ณ ที่จ่าย"
                  action={<Button onClick={() => setShowAddVendor(true)}><Plus size={14} className="mr-1" /> เพิ่มผู้ขาย</Button>}
                />
              ) : (
                <div className="text-center py-12 text-[13px] text-[#888780]">ไม่พบ "{search}"</div>
              )
            ) : viewMode === "grid" ? (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {filteredVendors.map((v) => (
                  <div key={v.id} className="bg-white border border-card-border rounded-[10px] p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => openEditVendor(v)}>
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-[#1A1A18] line-clamp-2 leading-tight">{v.name}</div>
                        {v.tax_id ? (
                          <div className="text-[11px] text-[#888780] mt-1 font-mono">{v.tax_id}</div>
                        ) : (
                          <div className="text-[11px] text-[#AAAAAA] mt-1 italic">ไม่มีเลขผู้เสียภาษี</div>
                        )}
                        {v.phone && <div className="text-[11px] text-[#888780] mt-0.5">{v.phone}</div>}
                      </div>
                      <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteVendor(v.id); }} className="p-1 rounded-md hover:bg-red-50 text-[#AAAAAA] hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white border border-card-border rounded-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-[#E8E6DF] bg-[#F7F6F3]">
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500">ชื่อ</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500">เลขผู้เสียภาษี</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500">ที่อยู่</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500">เบอร์โทร</th>
                        <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-500" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVendors.map((v) => (
                        <tr key={v.id} className="border-b border-[#F0EFE9] hover:bg-[#F7F6F3] transition-colors cursor-pointer" onClick={() => openEditVendor(v)}>
                          <td className="px-3 py-2 font-medium">{v.name}</td>
                          <td className="px-3 py-2 font-mono text-[12px] text-[#888780]">{v.tax_id || "-"}</td>
                          <td className="px-3 py-2 text-[#888780] max-w-[200px] truncate">{v.address || "-"}</td>
                          <td className="px-3 py-2 text-[#888780]">{v.phone || "-"}</td>
                          <td className="px-3 py-2 text-right">
                            <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteVendor(v.id); }} className="p-1.5 rounded-md hover:bg-red-50 text-[#AAAAAA] hover:text-red-500">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showAddRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowAddRecord(false)} />
          <div className="relative bg-white rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 shadow-xl mx-4">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
            <h2 className="text-[16px] font-semibold text-[#1A1A18] mb-4">เพิ่มรายการ WHT</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ผู้ขาย/ผู้รับเงิน *</label>
                <select value={newRecord.vendor_id} onChange={(e) => setNewRecord({ ...newRecord, vendor_id: e.target.value })} className="w-full bg-[#F7F6F3] border-[0.5px] border-[#E8E6DF] rounded-lg px-3 py-[10px] text-[13px] text-[#1A1A18] focus:outline-none focus:border-[#378ADD] [color-scheme:dark]">
                  <option value="">เลือกผู้ขาย</option>
                  {allVendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">แบบภาษี *</label>
                <select value={newRecord.form_type} onChange={(e) => setNewRecord({ ...newRecord, form_type: e.target.value as WhtFormType })} className="w-full bg-[#F7F6F3] border-[0.5px] border-[#E8E6DF] rounded-lg px-3 py-[10px] text-[13px] text-[#1A1A18] focus:outline-none focus:border-[#378ADD] [color-scheme:dark]">
                  {WHT_FORM_TYPES.map((ft) => <option key={ft} value={ft}>{WHT_FORM_TYPE_LABELS[ft]}</option>)}
                </select>
              </div>
              <Input label="วันที่ *" type="date" value={newRecord.issue_date} onChange={(e) => setNewRecord({ ...newRecord, issue_date: e.target.value })} />
              <Input label="จำนวนเงิน *" type="number" step="0.01" value={newRecord.amount} onChange={(e) => setNewRecord({ ...newRecord, amount: e.target.value })} placeholder="0.00" />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">อัตรา WHT (%) *</label>
                <select value={newRecord.wht_rate} onChange={(e) => setNewRecord({ ...newRecord, wht_rate: e.target.value })} className="w-full bg-[#F7F6F3] border-[0.5px] border-[#E8E6DF] rounded-lg px-3 py-[10px] text-[13px] text-[#1A1A18] focus:outline-none focus:border-[#378ADD] [color-scheme:dark]">
                  <option value="1">1%</option>
                  <option value="2">2%</option>
                  <option value="3">3%</option>
                  <option value="5">5%</option>
                  <option value="0">0%</option>
                </select>
              </div>
              {newRecord.amount && (
                <div className="text-[12px] text-[#888780]">
                  WHT = {formatCurrency(parseFloat(newRecord.amount) * parseFloat(newRecord.wht_rate) / 100)}
                </div>
              )}
              <div>
                <label className="block text-[12px] font-medium text-[#888780] mb-1.5">รายละเอียด *</label>
                <input
                  list="wht-description-presets"
                  value={newRecord.description}
                  onChange={(e) => setNewRecord({ ...newRecord, description: e.target.value })}
                  placeholder="เลือกหรือพิมพ์เอง"
                  className="w-full bg-[#F7F6F3] border-[0.5px] border-[#E8E6DF] rounded-lg px-3 py-[10px] text-[13px] text-[#1A1A18] placeholder-[#AAAAAA] focus:outline-none focus:border-[#378ADD] focus:ring-1 focus:ring-[#378ADD]/20 transition-colors"
                />
              </div>
              <Input label="หมายเหตุ" value={newRecord.note} onChange={(e) => setNewRecord({ ...newRecord, note: e.target.value })} />
              <div className="flex gap-2 pt-2">
                <Button onClick={handleAddRecord} disabled={!newRecord.vendor_id || !newRecord.amount || !newRecord.description.trim() || saving} loading={saving} className="flex-1">บันทึก</Button>
                <Button variant="secondary" onClick={() => setShowAddRecord(false)} className="flex-1">ยกเลิก</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowEditRecord(null)} />
          <div className="relative bg-white rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 shadow-xl mx-4">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
            <h2 className="text-[16px] font-semibold text-[#1A1A18] mb-4">แก้ไขรายการ WHT</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ผู้ขาย/ผู้รับเงิน *</label>
                <select value={editRecordForm.vendor_id} onChange={(e) => setEditRecordForm({ ...editRecordForm, vendor_id: e.target.value })} className="w-full bg-[#F7F6F3] border-[0.5px] border-[#E8E6DF] rounded-lg px-3 py-[10px] text-[13px] text-[#1A1A18] focus:outline-none focus:border-[#378ADD] [color-scheme:dark]">
                  {allVendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">แบบภาษี *</label>
                <select value={editRecordForm.form_type} onChange={(e) => setEditRecordForm({ ...editRecordForm, form_type: e.target.value as WhtFormType })} className="w-full bg-[#F7F6F3] border-[0.5px] border-[#E8E6DF] rounded-lg px-3 py-[10px] text-[13px] text-[#1A1A18] focus:outline-none focus:border-[#378ADD] [color-scheme:dark]">
                  {WHT_FORM_TYPES.map((ft) => <option key={ft} value={ft}>{WHT_FORM_TYPE_LABELS[ft]}</option>)}
                </select>
              </div>
              <Input label="วันที่ *" type="date" value={editRecordForm.issue_date} onChange={(e) => setEditRecordForm({ ...editRecordForm, issue_date: e.target.value })} />
              <Input label="จำนวนเงิน *" type="number" step="0.01" value={editRecordForm.amount} onChange={(e) => setEditRecordForm({ ...editRecordForm, amount: e.target.value })} />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">อัตรา WHT (%) *</label>
                <select value={editRecordForm.wht_rate} onChange={(e) => setEditRecordForm({ ...editRecordForm, wht_rate: e.target.value })} className="w-full bg-[#F7F6F3] border-[0.5px] border-[#E8E6DF] rounded-lg px-3 py-[10px] text-[13px] text-[#1A1A18] focus:outline-none focus:border-[#378ADD] [color-scheme:dark]">
                  <option value="1">1%</option>
                  <option value="2">2%</option>
                  <option value="3">3%</option>
                  <option value="5">5%</option>
                  <option value="0">0%</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#888780] mb-1.5">รายละเอียด *</label>
                <input
                  list="wht-description-presets"
                  value={editRecordForm.description}
                  onChange={(e) => setEditRecordForm({ ...editRecordForm, description: e.target.value })}
                  placeholder="เลือกหรือพิมพ์เอง"
                  className="w-full bg-[#F7F6F3] border-[0.5px] border-[#E8E6DF] rounded-lg px-3 py-[10px] text-[13px] text-[#1A1A18] placeholder-[#AAAAAA] focus:outline-none focus:border-[#378ADD] focus:ring-1 focus:ring-[#378ADD]/20 transition-colors"
                />
              </div>
              <Input label="หมายเหตุ" value={editRecordForm.note} onChange={(e) => setEditRecordForm({ ...editRecordForm, note: e.target.value })} />
              <div className="flex gap-2 pt-2">
                <Button onClick={handleUpdateRecord} loading={saving} className="flex-1">บันทึก</Button>
                <Button variant="secondary" onClick={() => setShowEditRecord(null)} className="flex-1">ยกเลิก</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowAddVendor(false)} />
          <div className="relative bg-white rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 shadow-xl mx-4">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
            <h2 className="text-[16px] font-semibold text-[#1A1A18] mb-4">เพิ่มผู้ขาย/ผู้รับเงิน</h2>
            <div className="space-y-3">
              <Input label="ชื่อบริษัท / ชื่อผู้ขาย *" value={newVendor.name} onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })} placeholder="เช่น บริษัท สยามปริ้นท์ จำกัด" autoFocus />
              <Input label="เลขผู้เสียภาษี (13 หลัก) *" value={newVendor.tax_id} onChange={(e) => setNewVendor({ ...newVendor, tax_id: e.target.value })} placeholder="13 หลัก" />
              <Input label="ที่อยู่ *" value={newVendor.address} onChange={(e) => setNewVendor({ ...newVendor, address: e.target.value })} />
              <Input label="เบอร์โทร" value={newVendor.phone} onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })} />
              <Input label="อีเมล" value={newVendor.email} onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })} type="email" />
              <Input label="ชื่อผู้ติดต่อ" value={newVendor.contact_name} onChange={(e) => setNewVendor({ ...newVendor, contact_name: e.target.value })} />
              <Input label="หมายเหตุ" value={newVendor.note} onChange={(e) => setNewVendor({ ...newVendor, note: e.target.value })} />
              <div className="flex gap-2 pt-2">
                <Button onClick={handleAddVendor} disabled={!newVendor.name.trim() || !newVendor.tax_id.trim() || !newVendor.address.trim() || saving} loading={saving} className="flex-1">บันทึก</Button>
                <Button variant="secondary" onClick={() => setShowAddVendor(false)} className="flex-1">ยกเลิก</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowEditVendor(null)} />
          <div className="relative bg-white rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 shadow-xl mx-4">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
            <h2 className="text-[16px] font-semibold text-[#1A1A18] mb-4">แก้ไขผู้ขาย</h2>
            <div className="space-y-3">
              <Input label="ชื่อบริษัท / ชื่อผู้ขาย *" value={editVendorForm.name} onChange={(e) => setEditVendorForm({ ...editVendorForm, name: e.target.value })} />
              <Input label="เลขผู้เสียภาษี *" value={editVendorForm.tax_id} onChange={(e) => setEditVendorForm({ ...editVendorForm, tax_id: e.target.value })} />
              <Input label="ที่อยู่ *" value={editVendorForm.address} onChange={(e) => setEditVendorForm({ ...editVendorForm, address: e.target.value })} />
              <Input label="เบอร์โทร" value={editVendorForm.phone} onChange={(e) => setEditVendorForm({ ...editVendorForm, phone: e.target.value })} />
              <Input label="อีเมล" value={editVendorForm.email} onChange={(e) => setEditVendorForm({ ...editVendorForm, email: e.target.value })} type="email" />
              <Input label="ชื่อผู้ติดต่อ" value={editVendorForm.contact_name} onChange={(e) => setEditVendorForm({ ...editVendorForm, contact_name: e.target.value })} />
              <Input label="หมายเหตุ" value={editVendorForm.note} onChange={(e) => setEditVendorForm({ ...editVendorForm, note: e.target.value })} />
              <div className="flex gap-2 pt-2">
                <Button onClick={handleUpdateVendor} disabled={!editVendorForm.name.trim() || !editVendorForm.tax_id.trim() || !editVendorForm.address.trim() || saving} loading={saving} className="flex-1">บันทึก</Button>
                <Button variant="secondary" onClick={() => setShowEditVendor(null)} className="flex-1">ยกเลิก</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    <datalist id="wht-description-presets">
        {WHT_DESCRIPTION_PRESETS.map((p) => <option key={p} value={p} />)}
      </datalist>
    </AppShell>
  );
}
