import { useState, useMemo, useEffect, type ReactNode } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Download, Trash2, Plus, FileText, Users, Eye, EyeOff, Pencil, Info, CheckCircle, Circle, Check, Wallet, BadgeCheck, ReceiptText, Sparkles, ExternalLink } from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Input, Select } from "../../../components/ui/Input";
import { SearchInput } from "../../../components/ui/SearchInput";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ViewToggle } from "../../../components/ui/ViewToggle";
import type { ViewMode } from "../../../components/ui/ViewToggle";
import { SortableTh } from "../../../components/ui/SortableTh";
import { useTableSort } from "../../../components/ui/useTableSort";
import { Card } from "../../../components/ui/Card";
import { Modal } from "../../../components/ui/Modal";
import { useWhtRecords, type WhtRecordWithVendor } from "../../../hooks/useWhtRecords";
import { useWhtVendors } from "../../../hooks/useWhtVendors";
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { formatCurrency } from "../../../lib/format";
import { supabase } from "../../../lib/supabase";
import { localTodayString } from "../../../lib/devDate";
import { formatBuddhistDate, formatBuddhistMonth } from "../../../lib/dates";
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
const WHT_FORM_TYPE_OPTIONS: WhtFormType[] = ["pnd3", "pnd53"];

const WHT_DESCRIPTION_PRESETS = [
  "ค่าจ้างทำของ",
  "ค่าขนส่ง",
  "ค่านายหน้า",
  "ค่าเบี้ยประกันวินาศภัย",
  "ค่าโฆษณา",
  "ค่าเช่า",
  "ค่าบริการ",
] as const;

const WHT_DESCRIPTION_RATE_MAP: Record<string, string> = {
  "ค่าจ้างทำของ": "3",
  "ค่าขนส่ง": "1",
  "ค่านายหน้า": "3",
  "ค่าเบี้ยประกันวินาศภัย": "1",
  "ค่าโฆษณา": "2",
  "ค่าเช่า": "5",
  "ค่าบริการ": "3",
};

function isPresetDescription(desc: string): boolean {
  return !!(desc && (WHT_DESCRIPTION_PRESETS as readonly string[]).includes(desc));
}

/** Format a 13-digit Thai tax ID as 1-2345-67890-12-3. Non-13-digit input passes through unchanged. */
function formatTaxId(raw: string | null | undefined): string {
  if (!raw) return "-";
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 13) return raw;
  return `${digits.slice(0, 1)}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits.slice(12)}`;
}

function isValidTaxId(raw: string): boolean {
  return /^\d{13}$/.test(raw.trim());
}

/** Mask for live typing: plain digits until 13, then grouped. */
function maskTaxIdInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 13);
  if (!raw && digits.length === 0) return "";
  return digits.length === 13 ? formatTaxId(digits) : digits;
}

interface VendorFormState {
  name: string;
  tax_id: string;
  address: string;
}

function validateVendorForm(v: VendorFormState): { name?: string; tax_id?: string; address?: string } {
  const errors: { name?: string; tax_id?: string; address?: string } = {};
  if (!v.name.trim()) errors.name = "กรุณากรอกชื่อ";
  if (!v.tax_id.trim()) errors.tax_id = "กรุณากรอกเลขผู้เสียภาษี";
  else if (!isValidTaxId(v.tax_id)) errors.tax_id = "ต้องเป็นตัวเลข 13 หลัก";
  if (!v.address.trim()) errors.address = "กรุณากรอกที่อยู่";
  return errors;
}

/** KPI stat card — mirrors the FinancialReport summary design language. */
function StatCard({ icon, label, value, tone = "default" }: { icon: ReactNode; label: string; value: string; tone?: "default" | "danger" | "primary" }) {
  const valueColor = tone === "danger" ? "text-[#C0392B]" : tone === "primary" ? "text-primary" : "text-[#1A1A18]";
  return (
    <Card className="min-h-[84px] border-[0.5px] p-3 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[#888780]">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#EAF4FF] text-primary">
          {icon}
        </span>
        {label}
      </div>
      <div className={`mt-2 text-base font-semibold leading-tight tabular-nums truncate ${valueColor}`} title={value}>
        {value}
      </div>
    </Card>
  );
}

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
  const navigate = useNavigate();
  const userId = profile?.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    records, loading: recordsLoading, addRecord, updateRecord, markDone, unmarkDone, deleteRecord,
    assignCertificateNo, months, vendors: recordVendors,
  } = useWhtRecords(userId);
  const {
    vendors: allVendors, loading: vendorsLoading, addVendor, updateVendor, deleteVendor,
  } = useWhtVendors(userId);

  const [tab, setTab] = useState<Tab>(TAB_RECORDS);
  const [doneView, setDoneView] = useState<"active" | "done" | "all">("active");
  const [month, setMonth] = useState(() => {
    const m = searchParams.get("month") ?? "";
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : "";
  });
  const [vendorFilter, setVendorFilter] = useState("");
  const [formFilter, setFormFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"" | "manual" | "payroll">(
    searchParams.get("source") === "payroll" ? "payroll" : "",
  );
  const [search, setSearch] = useState("");
  const [generating, setGenerating] = useState(false);

  const [showAddRecord, setShowAddRecord] = useState(false);
  const [showEditRecord, setShowEditRecord] = useState<WhtRecordWithVendor | null>(null);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [showEditVendor, setShowEditVendor] = useState<WhtVendor | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [saving, setSaving] = useState(false);
  const [showSig, setShowSig] = useState(true);
  const [showStp, setShowStp] = useState(true);
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    if (clientProfile) {
      if (showSig !== clientProfile.show_signature_on_wht) setShowSig(clientProfile.show_signature_on_wht !== false);
      if (showStp !== clientProfile.show_stamp_on_wht) setShowStp(clientProfile.show_stamp_on_wht !== false);
    }
  }, [clientProfile]);

  const [newRecord, setNewRecord] = useState({
    vendor_id: "",
    form_type: "pnd3" as WhtFormType,
    issue_date: localTodayString(),
    amount: "",
    wht_rate: "3",
    description: "",
    note: "",
  });
  const [customDescAddMode, setCustomDescAddMode] = useState(false);

  function resetNewRecord() {
    setNewRecord({
      vendor_id: "",
      form_type: "pnd3" as WhtFormType,
      issue_date: localTodayString(),
      amount: "",
      wht_rate: "3",
      description: "",
      note: "",
    });
    setCustomDescAddMode(false);
  }

  function openAddRecord() {
    resetNewRecord();
    setShowAddRecord(true);
  }

  function closeEditRecord() {
    setShowEditRecord(null);
    setCustomDescEditMode(false);
  }
  const [editRecordForm, setEditRecordForm] = useState({
    vendor_id: "",
    form_type: "pnd3" as WhtFormType,
    issue_date: "",
    amount: "",
    wht_rate: "3",
    description: "",
    note: "",
  });
  const [customDescEditMode, setCustomDescEditMode] = useState(false);
  const [newVendor, setNewVendor] = useState({ name: "", vendor_type: "company" as "company" | "individual", tax_id: "", address: "", phone: "", email: "", contact_name: "", note: "" });
  const [editVendorForm, setEditVendorForm] = useState({ name: "", vendor_type: "company" as "company" | "individual", tax_id: "", address: "", phone: "", email: "", contact_name: "", note: "" });
  const [vendorErrors, setVendorErrors] = useState<{ name?: string; tax_id?: string; address?: string }>({});
  const [amountError, setAmountError] = useState<string | null>(null);

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (sourceFilter && (r.source ?? "manual") !== sourceFilter) return false;
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
  }, [records, month, vendorFilter, formFilter, search, sourceFilter]);

  const activeRecords = useMemo(() => filteredRecords.filter((r) => r.status !== "done"), [filteredRecords]);
  const doneRecords = useMemo(() => filteredRecords.filter((r) => r.status === "done"), [filteredRecords]);
  const displayedRecords = doneView === "all" ? filteredRecords : doneView === "active" ? activeRecords : doneRecords;

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

  const payrollStrip = useMemo(() => {
    if (sourceFilter !== "payroll") return null;
    const pnd1 = filteredRecords.filter((r) => r.form_type === "pnd1");
    const pnd3 = filteredRecords.filter((r) => r.form_type === "pnd3");
    return {
      count: filteredRecords.length,
      totalWht: filteredRecords.reduce((s, r) => s + r.wht_amount, 0),
      pnd1Count: pnd1.length,
      pnd1Wht: pnd1.reduce((s, r) => s + r.wht_amount, 0),
      pnd3Count: pnd3.length,
      pnd3Wht: pnd3.reduce((s, r) => s + r.wht_amount, 0),
    };
  }, [sourceFilter, filteredRecords]);

  const [missingTaxIdCount, setMissingTaxIdCount] = useState(0);
  useEffect(() => {
    if (sourceFilter !== "payroll" || !userId) {
      setMissingTaxIdCount(0);
      return;
    }
    supabase
      .from("employees")
      .select("id, tax_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .then(({ data }) => {
        const list = (data ?? []) as { id: string; tax_id: string | null }[];
        setMissingTaxIdCount(list.filter((e) => !(e.tax_id ?? "").trim()).length);
      });
  }, [sourceFilter, userId]);

  const vendorStats = useMemo(() => {
    const map = new Map<string, { count: number; totalPaid: number; totalWht: number; lastDate: string | null }>();
    for (const r of records) {
      const stat = map.get(r.vendor_id) || { count: 0, totalPaid: 0, totalWht: 0, lastDate: null as string | null };
      stat.count += 1;
      stat.totalPaid += r.amount;
      stat.totalWht += r.wht_amount;
      if (r.issue_date && (!stat.lastDate || r.issue_date > stat.lastDate)) stat.lastDate = r.issue_date;
      map.set(r.vendor_id, stat);
    }
    return map;
  }, [records]);

  type WhtSortKey = "created_at" | "issue_date" | "form_type" | "amount";
  const tableSort = useTableSort<WhtRecordWithVendor, WhtSortKey>(displayedRecords, { key: "created_at", dir: "desc" });

  function formatDate(d: string) {
    if (!d) return "-";
    return formatBuddhistDate(d);
  }

  const parsedNewAmount = parseFloat(newRecord.amount);
  const previewWht = !isNaN(parsedNewAmount) && parsedNewAmount > 0
    ? formatCurrency(parsedNewAmount * parseFloat(newRecord.wht_rate) / 100)
    : null;

  async function handleAddRecord() {
    if (!newRecord.vendor_id || !newRecord.amount || !newRecord.description.trim()) return;
    if (isNaN(parsedNewAmount) || parsedNewAmount <= 0) {
      setAmountError("จำนวนเงินต้องมากกว่า 0");
      return;
    }
    setAmountError(null);
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
      resetNewRecord();
      toast.success("เพิ่มรายการหัก ณ ที่จ่ายแล้ว");
    } catch (e: any) {
      toast.error(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateRecord() {
    if (!showEditRecord) return;
    const parsedAmount = parseFloat(editRecordForm.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setAmountError("จำนวนเงินต้องมากกว่า 0");
      return;
    }
    if (!editRecordForm.description.trim()) return;
    setAmountError(null);
    setSaving(true);
    try {
      await updateRecord(showEditRecord.id, {
        vendor_id: editRecordForm.vendor_id || showEditRecord.vendor_id,
        form_type: editRecordForm.form_type,
        issue_date: editRecordForm.issue_date,
        amount: parsedAmount,
        wht_rate: parseFloat(editRecordForm.wht_rate),
        description: editRecordForm.description || null,
        note: editRecordForm.note || null,
      });
      closeEditRecord();
      toast.success("อัปเดตรายการหัก ณ ที่จ่ายแล้ว");
    } catch (e: any) {
      toast.error(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  function openEditRecord(record: WhtRecordWithVendor) {
    setShowEditRecord(record);
    setAmountError(null);
    const desc = record.description || "";
    setCustomDescEditMode(desc !== "" && !isPresetDescription(desc));
    setEditRecordForm({
      vendor_id: record.vendor_id,
      form_type: record.form_type,
      issue_date: record.issue_date?.slice(0, 10) || "",
      amount: String(record.amount),
      wht_rate: String(record.wht_rate),
      description: desc,
      note: record.note || "",
    });
  }

  async function handleVendorChangeForRecord(vendorId: string, isEdit: boolean) {
    const vendor = allVendors.find((v) => v.id === vendorId);
    if (!vendor) return;
    const autoFormType: WhtFormType = vendor.vendor_type === "individual" ? "pnd3" : "pnd53";
    if (isEdit) {
      setEditRecordForm((prev) => ({ ...prev, vendor_id: vendorId, form_type: autoFormType }));
    } else {
      setNewRecord((prev) => ({ ...prev, vendor_id: vendorId, form_type: autoFormType }));
    }
    try {
      const { data } = await supabase
        .from("wht_records")
        .select("amount, description, wht_rate, form_type")
        .eq("vendor_id", vendorId)
        .eq("user_id", userId || "")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        const lastAmt = String(data.amount ?? "");
        const lastDesc = data.description || "";
        const lastRate = String(data.wht_rate ?? "3");
        const descIsCustom = lastDesc !== "" && !isPresetDescription(lastDesc);
        if (isEdit) {
          setCustomDescEditMode(descIsCustom);
          setEditRecordForm((prev) => ({ ...prev, amount: lastAmt, description: lastDesc, wht_rate: lastRate }));
        } else {
          setCustomDescAddMode(descIsCustom);
          setNewRecord((prev) => ({ ...prev, amount: lastAmt, description: lastDesc, wht_rate: lastRate }));
        }
      }
    } catch {
      // ignore — keep defaults
    }
  }

  async function deleteRecordConfirmed(id: string) {
    try {
      await deleteRecord(id);
      toast.success("ลบรายการแล้ว");
    } catch (e: any) {
      toast.error(e.message || "เกิดข้อผิดพลาด");
    }
  }

  function handleDeleteRecord(id: string) {
    setConfirmState({
      title: "ลบรายการหัก ณ ที่จ่าย",
      message: "รายการนี้จะถูกลบถาวร ไม่สามารถกู้คืนได้",
      onConfirm: () => void deleteRecordConfirmed(id),
    });
  }

  async function handleMarkDone(id: string) {
    try {
      await markDone(id);
      toast.success("ทำเครื่องหมายเรียบร้อยแล้ว");
    } catch (e: any) {
      toast.error(e.message || "เกิดข้อผิดพลาด");
    }
  }

  async function handleUnmarkDone(id: string) {
    try {
      await unmarkDone(id);
      toast.success("ย้ายกลับรายการรอจัดการแล้ว");
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
    const errors = validateVendorForm(newVendor);
    setVendorErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    try {
      await addVendor(newVendor);
      setShowAddVendor(false);
      setNewVendor({ name: "", vendor_type: "company", tax_id: "", address: "", phone: "", email: "", contact_name: "", note: "" });
      toast.success("เพิ่มผู้ขายแล้ว");
    } catch (e: any) {
      toast.error(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateVendor() {
    if (!showEditVendor) return;
    const errors = validateVendorForm(editVendorForm);
    setVendorErrors(errors);
    if (Object.keys(errors).length > 0) return;
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
    setVendorErrors({});
    setEditVendorForm({
      name: v.name,
      vendor_type: v.vendor_type || "company",
      tax_id: v.tax_id || "",
      address: v.address || "",
      phone: v.phone || "",
      email: v.email || "",
      contact_name: v.contact_name || "",
      note: v.note || "",
    });
  }

  function openAddVendorForm() {
    setVendorErrors({});
    setShowAddVendor(true);
  }

  async function deleteVendorConfirmed(id: string) {
    try {
      await deleteVendor(id);
      toast.success("ลบผู้ขายแล้ว");
    } catch (e: any) {
      toast.error(e.message || "เกิดข้อผิดพลาด");
    }
  }

  function handleDeleteVendor(id: string) {
    setConfirmState({
      title: "ลบผู้ขาย/ผู้รับเงิน",
      message: "รายการหัก ณ ที่จ่ายที่เชื่อมโยงกับผู้ขายนี้จะยังคงอยู่",
      onConfirm: () => void deleteVendorConfirmed(id),
    });
  }

  const availableMonths = months;

  return (
    <AppShell title="ภาษีหัก ณ ที่จ่าย">
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
            บันทึก หัก ณ ที่จ่าย
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
            {records.length > 0 && !recordsLoading && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard icon={<FileText className="h-4 w-4" />} label="รายการ" value={`${summary.count} รายการ`} />
                <StatCard icon={<Wallet className="h-4 w-4" />} label="ยอดจ่ายรวม" value={`฿${formatCurrency(summary.totalAmount)}`} />
                <StatCard icon={<ReceiptText className="h-4 w-4" />} label="ภาษีหัก ณ ที่จ่ายรวม" value={`฿${formatCurrency(summary.totalWht)}`} tone="danger" />
                <StatCard icon={<BadgeCheck className="h-4 w-4" />} label="ออกใบรับรองแล้ว" value={`${summary.generated} / ${summary.count}`} tone={summary.generated > 0 ? "primary" : "default"} />
              </div>
            )}

            {payrollStrip && (
              <div className="rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                  <span className="inline-flex items-center gap-1 font-medium text-teal-800">
                    <Sparkles size={13} /> จากรอบเงินเดือน
                  </span>
                  <span className="text-teal-700">{payrollStrip.count} รายการ · ภาษีรวม <strong className="tabular-nums">฿{formatCurrency(payrollStrip.totalWht)}</strong></span>
                  <span className="text-[12px] text-teal-600">
                    ภ.ง.ด.1 {payrollStrip.pnd1Count} (฿{formatCurrency(payrollStrip.pnd1Wht)}) · ภ.ง.ด.3 {payrollStrip.pnd3Count} (฿{formatCurrency(payrollStrip.pnd3Wht)})
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate("/payroll")}
                    className="ml-auto text-[12px] font-medium text-teal-700 hover:text-teal-900 underline underline-offset-2"
                  >
                    ← กลับหน้าเงินเดือน
                  </button>
                </div>
                {missingTaxIdCount > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1 text-[12px] text-amber-700">
                    <Info size={13} className="shrink-0" />
                    <span>
                      พนักงาน {missingTaxIdCount} คนยังไม่มีเลขภาษี — ภาษีของพวกเขาจะไม่ถูกสร้างตอนซิงก์
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate("/payroll/employees")}
                      className="font-medium underline underline-offset-2 hover:text-amber-900"
                    >
                      ไปเพิ่มที่หน้าพนักงาน
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="ค้นหาชื่อ เลขที่ผู้เสียภาษี เลขใบรับรอง..." className="flex-1 min-w-[200px]" />
              <select aria-label="กรองตามเดือน" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-white border-[0.5px] border-[#E8E6DF] rounded-lg px-3 py-[10px] text-[13px] text-[#1A1A18] focus:outline-none focus:border-[#378ADD] [color-scheme:dark]">
                <option value="">ทุกเดือน</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>{formatBuddhistMonth(m)}</option>
                ))}
              </select>
              <select aria-label="กรองตามผู้ขาย" value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className="bg-white border-[0.5px] border-[#E8E6DF] rounded-lg px-3 py-[10px] text-[13px] text-[#1A1A18] focus:outline-none focus:border-[#378ADD] [color-scheme:dark]">
                <option value="">ผู้ขายทั้งหมด</option>
                {recordVendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <select aria-label="กรองตามแบบภาษี" value={formFilter} onChange={(e) => setFormFilter(e.target.value)} className="bg-white border-[0.5px] border-[#E8E6DF] rounded-lg px-3 py-[10px] text-[13px] text-[#1A1A18] focus:outline-none focus:border-[#378ADD] [color-scheme:dark]">
                <option value="">ทุกแบบ</option>
                {WHT_FORM_TYPES.map((ft) => (
                  <option key={ft} value={ft}>{WHT_FORM_TYPE_LABELS[ft]}</option>
                ))}
              </select>
              <select
                aria-label="กรองตามแหล่งที่มา"
                value={sourceFilter}
                onChange={(e) => {
                  const value = e.target.value as "" | "manual" | "payroll";
                  setSourceFilter(value);
                  const next = new URLSearchParams(searchParams);
                  if (value) next.set("source", value);
                  else next.delete("source");
                  setSearchParams(next, { replace: true });
                }}
                className="bg-white border-[0.5px] border-[#E8E6DF] rounded-lg px-3 py-[10px] text-[13px] text-[#1A1A18] focus:outline-none focus:border-[#378ADD] [color-scheme:dark]"
              >
                <option value="">ทุกแหล่งที่มา</option>
                <option value="manual">รายการรับเอง</option>
                <option value="payroll">จากเงินเดือน</option>
              </select>
              <Button onClick={openAddRecord} className="!rounded-lg shrink-0">
                <Plus size={15} className="mr-1" /> เพิ่มรายการ
              </Button>
            </div>

            {!recordsLoading && filteredRecords.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-0.5 bg-[#F0EFE9] rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setDoneView("active")}
                    className={`px-3 py-1 text-[12px] font-medium rounded-md transition-colors ${
                      doneView === "active" ? "bg-white text-[#1A1A18] shadow-sm" : "text-[#888780] hover:text-[#1A1A18]"
                    }`}
                  >
                    รอจัดการ ({activeRecords.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDoneView("done")}
                    className={`px-3 py-1 text-[12px] font-medium rounded-md transition-colors ${
                      doneView === "done" ? "bg-white text-[#1A1A18] shadow-sm" : "text-[#888780] hover:text-[#1A1A18]"
                    }`}
                  >
                    เรียบร้อย ({doneRecords.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDoneView("all")}
                    className={`px-3 py-1 text-[12px] font-medium rounded-md transition-colors ${
                      doneView === "all" ? "bg-white text-[#1A1A18] shadow-sm" : "text-[#888780] hover:text-[#1A1A18]"
                    }`}
                  >
                    ทั้งหมด ({filteredRecords.length})
                  </button>
                </div>

                <div className="flex items-center gap-1 ml-auto">
                  <span className="text-[10px] text-[#CCCCCC] mr-0.5">PDF</span>
                  <button
                    type="button"
                    onClick={() => setShowSig(!showSig)}
                    title={`ลายเซ็น: ${showSig ? "แสดง" : "ซ่อน"}`}
                    className={`flex items-center gap-1 rounded border px-1.5 py-0.5 transition-colors ${
                      showSig ? "border-blue-200 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500"
                    }`}
                  >
                    {showSig ? <Eye size={12} /> : <EyeOff size={12} />}
                    <span className="text-[10px]">ลายเซ็น</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowStp(!showStp)}
                    title={`ตราประทับ: ${showStp ? "แสดง" : "ซ่อน"}`}
                    className={`flex items-center gap-1 rounded border px-1.5 py-0.5 transition-colors ${
                      showStp ? "border-orange-200 bg-orange-50 text-orange-600" : "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500"
                    }`}
                  >
                    {showStp ? <Eye size={12} /> : <EyeOff size={12} />}
                    <span className="text-[10px]">ตรา</span>
                  </button>
                  <div className="w-px h-4 bg-gray-200 mx-1.5" />
                  <Button size="sm" variant="secondary" onClick={handleBatchGenerate} loading={generating} className="!rounded-lg">
                    <Download size={14} className="mr-1" /> ออกรายงาน PDF
                  </Button>
                </div>
              </div>
            )}

            {recordsLoading ? (
              <div className="bg-white border border-card-border rounded-card overflow-hidden">
                <div className="p-4 space-y-2">
                  {[...Array(6)].map((_, i) => <div key={i} className="h-8 bg-gray-200 rounded animate-pulse" />)}
                </div>
              </div>
            ) : filteredRecords.length === 0 ? (
              records.length === 0 ? (
                <EmptyState
                  title="ยังไม่มีรายการ หัก ณ ที่จ่าย"
                  description="เพิ่มรายการหัก ณ ที่จ่าย เพื่อออกรายงานและใบรับรอง"
                  action={<Button onClick={openAddRecord}><Plus size={15} className="mr-1" /> เพิ่มรายการ หัก ณ ที่จ่าย</Button>}
                />
              ) : (
                <div className="text-center py-12 text-[13px] text-[#888780]">
                  <p>ไม่พบรายการที่ตรงกับตัวกรอง</p>
                </div>
              )
            ) : displayedRecords.length === 0 ? (
              <div className="text-center py-12 text-[13px] text-[#888780]">
                <p>{doneView === "all" ? "ไม่มีรายการ" : doneView === "active" ? "ไม่มีรายการรอจัดการ" : "ไม่มีรายการที่เรียบร้อย"}</p>
              </div>
            ) : (
              <div className="bg-white border border-card-border rounded-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-[#E6EBF2] bg-[#F4F7FB]">
                        <th className="px-3 py-2.5 w-[44px] text-center" title="ทำเครื่องหมายว่าเรียบร้อย">
                          <span className="inline-flex items-center justify-center text-[#344054]"><Check className="h-3.5 w-3.5" aria-hidden /></span>
                          <span className="sr-only">เรียบร้อย</span>
                        </th>
                        <SortableTh
                          label="วันที่จ่าย"
                          active={tableSort.sort.key === "issue_date"}
                          dir={tableSort.sort.dir}
                          onClick={() => tableSort.handleSort("issue_date")}
                          className="px-3 py-2.5"
                        />
                        <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-[#344054] tracking-[0.04em] whitespace-nowrap">ผู้ขาย</th>
                        <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-[#344054] tracking-[0.04em] whitespace-nowrap">เลขที่ผู้เสียภาษี</th>
                        <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-[#344054] tracking-[0.04em] whitespace-nowrap">รายละเอียด</th>
                        <SortableTh
                          label="แบบ"
                          active={tableSort.sort.key === "form_type"}
                          dir={tableSort.sort.dir}
                          onClick={() => tableSort.handleSort("form_type")}
                          className="px-3 py-2.5"
                        />
                        <SortableTh
                          label="จำนวนเงิน"
                          align="right"
                          active={tableSort.sort.key === "amount"}
                          dir={tableSort.sort.dir}
                          onClick={() => tableSort.handleSort("amount")}
                          className="px-3 py-2.5"
                        />
                        <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-[#344054] tracking-[0.04em] whitespace-nowrap">หัก ณ ที่จ่าย</th>
                        <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-[#344054] tracking-[0.04em] whitespace-nowrap">ใบรับรอง</th>
                        <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-[#344054] tracking-[0.04em]" />
                      </tr>
                    </thead>
                    <tbody>
                      {tableSort.sorted.map((r, idx) => {
                        const isDone = r.status === "done";
                        return (
                        <tr key={r.id} className={`border-b border-[#F0EFE9] hover:bg-[#FAFAF8] transition-colors ${isDone ? "opacity-60" : ""}`}>
                          <td className="px-3 py-2.5 text-center">
                            {isDone ? (
                              <button type="button" onClick={() => handleUnmarkDone(r.id)} className="text-green-500 hover:text-green-600 transition-colors" title="เรียบร้อยแล้ว — คลิกเพื่อย้อนกลับ">
                                <CheckCircle size={16} />
                              </button>
                            ) : (
                              <button type="button" onClick={() => handleMarkDone(r.id)} className="text-[#CCCCCC] hover:text-green-500 transition-colors" title="รอจัดการ — คลิกเมื่อเรียบร้อย">
                                <Circle size={16} />
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="text-[#1A1A18]">{formatDate(r.issue_date)}</div>
                            <div className="text-[10px] text-[#AAAAAA] mt-0.5">บันทึก {formatDate(r.created_at)}</div>
                          </td>
                          <td className="px-3 py-2.5 text-[#1A1A18]">{r.vendor?.name || "-"}</td>
                          <td className="px-3 py-2.5 font-mono text-[12px] text-[#888780]">{formatTaxId(r.vendor?.tax_id)}</td>
                          <td className="px-3 py-2.5 text-[12px] text-[#555]">{r.description || "-"}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1">
                              <span
                                className="inline-block px-2 py-0.5 rounded text-[11px] font-medium"
                                style={{ backgroundColor: `${WHT_FORM_TYPE_COLORS[r.form_type]}15`, color: WHT_FORM_TYPE_COLORS[r.form_type] }}
                              >
                                {WHT_FORM_TYPE_LABELS[r.form_type] || r.form_type}
                              </span>
                              {r.source === "payroll" && r.payroll_run_id && (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/payroll?run=${r.payroll_run_id}`)}
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 text-[10px] font-medium hover:bg-teal-100 transition-colors"
                                  title="สร้างอัตโนมัติจากรอบเงินเดือน — กดเพื่อเปิดรอบนั้น"
                                >
                                  <Sparkles size={10} /> Payroll
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[#1A1A18]">{formatCurrency(r.amount)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[#C0392B]">{formatCurrency(r.wht_amount)}</td>
                          <td className="px-3 py-2.5">
                            {r.certificate_no ? (
                              <span className="inline-block px-2 py-0.5 rounded bg-[#EEF4FF] text-[#378ADD] font-mono text-[11px] font-medium">{r.certificate_no}</span>
                            ) : (
                              <span className="text-[#CCCCCC] text-[12px]">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-0.5">
                              <button type="button" onClick={() => handleGenerateSingle(r)} disabled={generating} className="p-1.5 rounded-md hover:bg-[#EEF2FF] text-[#378ADD] transition-colors" title={r.certificate_no ? "ดู / พิมพ์ซ้ำ" : "ดาวน์โหลด PDF"}>
                                <Download size={15} />
                              </button>
                              {r.status !== "done" && r.source !== "payroll" && (
                                <button type="button" onClick={() => openEditRecord(r)} className="p-1.5 rounded-md hover:bg-[#F7F6F3] text-[#888780] hover:text-[#1A1A18] transition-colors" title={r.certificate_no ? "แก้ไข (ใบรับรองออกแล้ว)" : "แก้ไข"}>
                                  <Pencil size={15} />
                                </button>
                              )}
                              {r.status !== "done" && r.source !== "payroll" && (
                                <button type="button" onClick={() => handleDeleteRecord(r.id)} className="p-1.5 rounded-md hover:bg-red-50 text-[#CCCCCC] hover:text-red-500 transition-colors" title="ลบ">
                                  <Trash2 size={15} />
                                </button>
                              )}
                              {r.source === "payroll" && r.payroll_run_id && (
                                <button type="button" onClick={() => navigate(`/payroll?run=${r.payroll_run_id}`)} className="p-1.5 rounded-md hover:bg-teal-50 text-[#CCCCCC] hover:text-teal-700 transition-colors" title="แก้ไขที่รอบเงินเดือน">
                                  <ExternalLink size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )})}
                      {tableSort.sorted.length > 0 && (
                        <tr className="border-t-[1.5px] border-[#E6EBF2] bg-[#FAFAF8] font-semibold text-[#344054]">
                          <td colSpan={6} className="px-3 py-2.5 text-right">รวม {tableSort.sorted.length} รายการ</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(tableSort.sorted.reduce((s, r) => s + r.amount, 0))}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[#C0392B]">{formatCurrency(tableSort.sorted.reduce((s, r) => s + r.wht_amount, 0))}</td>
                          <td colSpan={2} />
                        </tr>
                      )}
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
              <Button size="sm" onClick={openAddVendorForm} className="!rounded-lg shrink-0">
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
                  action={<Button onClick={openAddVendorForm}><Plus size={14} className="mr-1" /> เพิ่มผู้ขาย</Button>}
                />
              ) : (
                <div className="text-center py-12 text-[13px] text-[#888780]">ไม่พบ "{search}"</div>
              )
            ) : viewMode === "grid" ? (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {filteredVendors.map((v) => {
                  const stat = vendorStats.get(v.id);
                  return (
                    <div key={v.id} className="bg-white border border-card-border rounded-[10px] p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => openEditVendor(v)}>
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold text-[#1A1A18] line-clamp-2 leading-tight">{v.name}</div>
                          <div className={`text-[11px] mt-1 font-mono ${v.tax_id ? "text-[#888780]" : "italic text-[#AAAAAA] font-sans"}`}>
                            {v.tax_id ? formatTaxId(v.tax_id) : "ไม่มีเลขผู้เสียภาษี"}
                          </div>
                          <div className="mt-2 pt-2 border-t border-gray-100 space-y-0.5">
                            {stat ? (
                              <>
                                <div className="flex items-center gap-1.5 text-[11px] text-[#888780]">
                                  <ReceiptText size={12} className="shrink-0" />
                                  {stat.count} รายการ
                                  <span className="text-[#CCCCCC]">·</span>
                                  ฿{formatCurrency(stat.totalPaid)}
                                  <span className="text-[#CCCCCC]">·</span>
                                  <span className="text-[#C0392B]">หัก ฿{formatCurrency(stat.totalWht)}</span>
                                </div>
                                {stat.lastDate && (
                                  <div className="text-[10px] text-[#AAAAAA]">จ่ายล่าสุด {formatDate(stat.lastDate)}</div>
                                )}
                              </>
                            ) : (
                              <div className="text-[11px] italic text-[#CCCCCC]">ยังไม่มีรายการ หัก ณ ที่จ่าย</div>
                            )}
                          </div>
                        </div>
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteVendor(v.id); }} className="p-1 rounded-md hover:bg-red-50 text-[#AAAAAA] hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white border border-card-border rounded-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-[#E6EBF2] bg-[#F4F7FB]">
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500">ชื่อ</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500">เลขผู้เสียภาษี</th>
                        <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-500">รายการ</th>
                        <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-500">ยอดจ่ายรวม</th>
                        <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-500">หัก ณ ที่จ่าย</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500">ที่อยู่</th>
                        <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-500" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVendors.map((v) => (
                        <tr key={v.id} className="border-b border-[#F0EFE9] hover:bg-[#F7F6F3] transition-colors cursor-pointer" onClick={() => openEditVendor(v)}>
                          <td className="px-3 py-2">{v.name}</td>
                          <td className="px-3 py-2 font-mono text-[12px] text-[#888780]">{formatTaxId(v.tax_id)}</td>
                          {(() => {
                            const stat = vendorStats.get(v.id);
                            return (
                              <>
                                <td className="px-3 py-2 text-center tabular-nums text-[12px]">{stat?.count ?? 0}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-[12px]">{stat ? formatCurrency(stat.totalPaid) : "-"}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-[12px] text-[#C0392B]">{stat ? formatCurrency(stat.totalWht) : "-"}</td>
                              </>
                            );
                          })()}
                          <td className="px-3 py-2 text-[#888780] max-w-[200px] truncate">{v.address || "-"}</td>
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

      <Modal open={showAddRecord} onClose={() => { setShowAddRecord(false); resetNewRecord(); }} title="เพิ่มรายการ หัก ณ ที่จ่าย">
        <div>
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-[#EEF4FF] px-3 py-2 text-[11px] text-[#378ADD]">
            <Info size={14} className="shrink-0" />
            <span>รุ่น Beta — รองรับเฉพาะ ภ.ง.ด.3 และ ภ.ง.ด.53</span>
          </div>
          <div className="space-y-3">
              <Select
                label="ผู้ขาย/ผู้รับเงิน *"
                value={newRecord.vendor_id}
                onChange={(e) => handleVendorChangeForRecord(e.target.value, false)}
              >
                <option value="">เลือกผู้ขาย</option>
                {allVendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
              <Select
                label="แบบภาษี *"
                value={newRecord.form_type}
                onChange={(e) => setNewRecord({ ...newRecord, form_type: e.target.value as WhtFormType })}
              >
                {WHT_FORM_TYPE_OPTIONS.map((ft) => <option key={ft} value={ft}>{WHT_FORM_TYPE_LABELS[ft]}</option>)}
              </Select>
              <Input label="วันที่ *" type="date" value={newRecord.issue_date} onChange={(e) => setNewRecord({ ...newRecord, issue_date: e.target.value })} />
              <div>
                <label htmlFor="wht-new-amount" className="block text-xs font-medium text-gray-600 mb-1">จำนวนเงิน *</label>
                <input
                  id="wht-new-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newRecord.amount}
                  onChange={(e) => {
                    setNewRecord({ ...newRecord, amount: e.target.value });
                    setAmountError(null);
                  }}
                  placeholder="0.00"
                  className={`w-full px-3 py-2 text-sm border rounded-lg bg-white placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors ${amountError ? "border-red-400" : "border-card-border"}`}
                />
                {amountError && <p className="text-xs text-red-500 mt-1">{amountError}</p>}
              </div>
              <div>
                <label htmlFor="wht-new-desc" className="block text-[12px] font-medium text-[#888780] mb-1.5">รายละเอียด *</label>
                {customDescAddMode ? (
                  <div className="flex gap-2">
                    <input
                      id="wht-new-desc"
                      value={newRecord.description}
                      onChange={(e) => setNewRecord({ ...newRecord, description: e.target.value })}
                      placeholder="พิมพ์รายละเอียด"
                      autoFocus
                      className="w-full bg-[#F7F6F3] border-[0.5px] border-[#E8E6DF] rounded-lg px-3 py-2.5 text-[13px] text-[#1A1A18] placeholder-[#AAAAAA] focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => { setCustomDescAddMode(false); setNewRecord({ ...newRecord, description: "" }); }}
                      className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-[12px] text-[#888780] hover:bg-[#F7F6F3] transition-colors"
                    >
                      ↰ เลือกจากรายการ
                    </button>
                  </div>
                ) : (
                  <select
                    value={newRecord.description}
                    onChange={(e) => {
                      const desc = e.target.value;
                      if (desc === "__custom__") {
                        setCustomDescAddMode(true);
                        setNewRecord({ ...newRecord, description: "" });
                        return;
                      }
                      const mappedRate = WHT_DESCRIPTION_RATE_MAP[desc];
                      setNewRecord({ ...newRecord, description: desc, ...(mappedRate ? { wht_rate: mappedRate } : {}) });
                    }}
                    className="w-full bg-[#F7F6F3] border-[0.5px] border-[#E8E6DF] rounded-lg px-3 py-2.5 text-[13px] text-[#1A1A18] focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20 transition-colors [color-scheme:dark]"
                  >
                    <option value="">เลือกประเภทรายจ่าย</option>
                    {WHT_DESCRIPTION_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                    <option value="__custom__">อื่นๆ (พิมพ์เอง)</option>
                  </select>
                )}
              </div>
              <Select
                label="อัตรา หัก ณ ที่จ่าย (%) *"
                value={newRecord.wht_rate}
                onChange={(e) => setNewRecord({ ...newRecord, wht_rate: e.target.value })}
              >
                <option value="1">1%</option>
                <option value="2">2%</option>
                <option value="3">3%</option>
                <option value="5">5%</option>
                <option value="0">0%</option>
              </Select>
              {previewWht && (
                <div className="text-[12px] text-[#888780]">
                  หัก ณ ที่จ่าย = {previewWht}
                </div>
              )}
              <Input label="หมายเหตุ" value={newRecord.note} onChange={(e) => setNewRecord({ ...newRecord, note: e.target.value })} />
              <div className="flex gap-2 pt-2">
                <Button onClick={handleAddRecord} disabled={!newRecord.vendor_id || !newRecord.amount || !newRecord.description.trim() || saving} loading={saving} className="flex-1">บันทึก</Button>
                <Button variant="secondary" onClick={() => { setShowAddRecord(false); resetNewRecord(); }} className="flex-1">ยกเลิก</Button>
              </div>
            </div>
        </div>
      </Modal>

      <Modal open={!!showEditRecord} onClose={closeEditRecord} title="แก้ไขรายการ หัก ณ ที่จ่าย">
        <div>
          {showEditRecord?.certificate_no && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>ใบรับรอง <span className="font-mono font-medium">{showEditRecord.certificate_no}</span> ออกแล้ว — หากแก้ไขข้อมูล เอกสาร PDF ที่พิมพ์ซ้ำจะแสดงค่าที่แก้ไขแล้ว</span>
            </div>
          )}
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-[#EEF4FF] px-3 py-2 text-[11px] text-[#378ADD]">
            <Info size={14} className="shrink-0" />
            <span>รุ่น Beta — รองรับเฉพาะ ภ.ง.ด.3 และ ภ.ง.ด.53</span>
          </div>
          <div className="space-y-3">
              <Select
                label="ผู้ขาย/ผู้รับเงิน *"
                value={editRecordForm.vendor_id}
                onChange={(e) => handleVendorChangeForRecord(e.target.value, true)}
              >
                <option value="">เลือกผู้ขาย</option>
                {allVendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
              <Select
                label="แบบภาษี *"
                value={editRecordForm.form_type}
                onChange={(e) => setEditRecordForm({ ...editRecordForm, form_type: e.target.value as WhtFormType })}
              >
                {WHT_FORM_TYPE_OPTIONS.map((ft) => <option key={ft} value={ft}>{WHT_FORM_TYPE_LABELS[ft]}</option>)}
              </Select>
              <Input label="วันที่ *" type="date" value={editRecordForm.issue_date} onChange={(e) => setEditRecordForm({ ...editRecordForm, issue_date: e.target.value })} />
              <div>
                <label htmlFor="wht-edit-amount" className="block text-xs font-medium text-gray-600 mb-1">จำนวนเงิน *</label>
                <input
                  id="wht-edit-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editRecordForm.amount}
                  onChange={(e) => {
                    setEditRecordForm({ ...editRecordForm, amount: e.target.value });
                    setAmountError(null);
                  }}
                  placeholder="0.00"
                  className={`w-full px-3 py-2 text-sm border rounded-lg bg-white placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors ${amountError ? "border-red-400" : "border-card-border"}`}
                />
                {amountError && <p className="text-xs text-red-500 mt-1">{amountError}</p>}
              </div>
              <div>
                <label htmlFor="wht-edit-desc" className="block text-[12px] font-medium text-[#888780] mb-1.5">รายละเอียด *</label>
                {customDescEditMode ? (
                  <div className="flex gap-2">
                    <input
                      id="wht-edit-desc"
                      value={editRecordForm.description}
                      onChange={(e) => setEditRecordForm({ ...editRecordForm, description: e.target.value })}
                      placeholder="พิมพ์รายละเอียด"
                      autoFocus
                      className="w-full bg-[#F7F6F3] border-[0.5px] border-[#E8E6DF] rounded-lg px-3 py-2.5 text-[13px] text-[#1A1A18] placeholder-[#AAAAAA] focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => { setCustomDescEditMode(false); setEditRecordForm({ ...editRecordForm, description: "" }); }}
                      className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-[12px] text-[#888780] hover:bg-[#F7F6F3] transition-colors"
                    >
                      ↰ เลือกจากรายการ
                    </button>
                  </div>
                ) : (
                  <select
                    value={editRecordForm.description}
                    onChange={(e) => {
                      const desc = e.target.value;
                      if (desc === "__custom__") {
                        setCustomDescEditMode(true);
                        setEditRecordForm({ ...editRecordForm, description: "" });
                        return;
                      }
                      const mappedRate = WHT_DESCRIPTION_RATE_MAP[desc];
                      setEditRecordForm({ ...editRecordForm, description: desc, ...(mappedRate ? { wht_rate: mappedRate } : {}) });
                    }}
                    className="w-full bg-[#F7F6F3] border-[0.5px] border-[#E8E6DF] rounded-lg px-3 py-2.5 text-[13px] text-[#1A1A18] focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20 transition-colors [color-scheme:dark]"
                  >
                    <option value="">เลือกประเภทรายจ่าย</option>
                    {WHT_DESCRIPTION_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                    <option value="__custom__">อื่นๆ (พิมพ์เอง)</option>
                  </select>
                )}
              </div>
              <Select
                label="อัตรา หัก ณ ที่จ่าย (%) *"
                value={editRecordForm.wht_rate}
                onChange={(e) => setEditRecordForm({ ...editRecordForm, wht_rate: e.target.value })}
              >
                <option value="1">1%</option>
                <option value="2">2%</option>
                <option value="3">3%</option>
                <option value="5">5%</option>
                <option value="0">0%</option>
              </Select>
              <Input label="หมายเหตุ" value={editRecordForm.note} onChange={(e) => setEditRecordForm({ ...editRecordForm, note: e.target.value })} />
              <div className="flex gap-2 pt-2">
                <Button onClick={handleUpdateRecord} loading={saving} className="flex-1">บันทึก</Button>
                <Button variant="secondary" onClick={closeEditRecord} className="flex-1">ยกเลิก</Button>
              </div>
            </div>
        </div>
      </Modal>

      <Modal open={showAddVendor} onClose={() => setShowAddVendor(false)} title="เพิ่มผู้ขาย/ผู้รับเงิน">
        <div className="space-y-3">
              <Select
                label="ประเภทผู้ขาย/ผู้รับเงิน *"
                value={newVendor.vendor_type}
                onChange={(e) => setNewVendor({ ...newVendor, vendor_type: e.target.value as "company" | "individual" })}
              >
                <option value="company">บริษัท</option>
                <option value="individual">บุคคล</option>
              </Select>
              <Input
                id="vendor-new-name"
                label={newVendor.vendor_type === "company" ? "ชื่อบริษัท *" : "ชื่อบุคคล *"}
                value={newVendor.name}
                onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
                placeholder={newVendor.vendor_type === "company" ? "เช่น บริษัท สยามปริ้นท์ จำกัด" : "เช่น นาย สมชาย ใจดี"}
                error={vendorErrors.name}
                autoFocus
              />
              <Input
                id="vendor-new-tax-id"
                label="เลขผู้เสียภาษี (13 หลัก) *"
                value={maskTaxIdInput(newVendor.tax_id)}
                onChange={(e) => setNewVendor({ ...newVendor, tax_id: e.target.value.replace(/\D/g, "").slice(0, 13) })}
                inputMode="numeric"
                placeholder="1-2345-67890-12-3"
                error={vendorErrors.tax_id}
              />
              <Input id="vendor-new-address" label="ที่อยู่ *" value={newVendor.address} onChange={(e) => setNewVendor({ ...newVendor, address: e.target.value })} error={vendorErrors.address} />
              <Input label="เบอร์โทร" value={newVendor.phone} onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })} />
              <Input label="อีเมล" value={newVendor.email} onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })} type="email" />
              <Input label="ชื่อผู้ติดต่อ" value={newVendor.contact_name} onChange={(e) => setNewVendor({ ...newVendor, contact_name: e.target.value })} />
              <Input label="หมายเหตุ" value={newVendor.note} onChange={(e) => setNewVendor({ ...newVendor, note: e.target.value })} />
              <div className="flex gap-2 pt-2">
                <Button onClick={handleAddVendor} disabled={saving} loading={saving} className="flex-1">บันทึก</Button>
                <Button variant="secondary" onClick={() => setShowAddVendor(false)} className="flex-1">ยกเลิก</Button>
              </div>
            </div>
      </Modal>

      <Modal open={!!showEditVendor} onClose={() => setShowEditVendor(null)} title="แก้ไขผู้ขาย">
        <div className="space-y-3">
              <Select
                label="ประเภทผู้ขาย/ผู้รับเงิน *"
                value={editVendorForm.vendor_type}
                onChange={(e) => setEditVendorForm({ ...editVendorForm, vendor_type: e.target.value as "company" | "individual" })}
              >
                <option value="company">บริษัท</option>
                <option value="individual">บุคคล</option>
              </Select>
              <Input
                id="vendor-edit-name"
                label={editVendorForm.vendor_type === "company" ? "ชื่อบริษัท *" : "ชื่อบุคคล *"}
                value={editVendorForm.name}
                onChange={(e) => setEditVendorForm({ ...editVendorForm, name: e.target.value })}
                error={vendorErrors.name}
              />
              <Input
                id="vendor-edit-tax-id"
                label="เลขผู้เสียภาษี *"
                value={maskTaxIdInput(editVendorForm.tax_id)}
                onChange={(e) => setEditVendorForm({ ...editVendorForm, tax_id: e.target.value.replace(/\D/g, "").slice(0, 13) })}
                inputMode="numeric"
                placeholder="1-2345-67890-12-3"
                error={vendorErrors.tax_id}
              />
              <Input id="vendor-edit-address" label="ที่อยู่ *" value={editVendorForm.address} onChange={(e) => setEditVendorForm({ ...editVendorForm, address: e.target.value })} error={vendorErrors.address} />
              <Input label="เบอร์โทร" value={editVendorForm.phone} onChange={(e) => setEditVendorForm({ ...editVendorForm, phone: e.target.value })} />
              <Input label="อีเมล" value={editVendorForm.email} onChange={(e) => setEditVendorForm({ ...editVendorForm, email: e.target.value })} type="email" />
              <Input label="ชื่อผู้ติดต่อ" value={editVendorForm.contact_name} onChange={(e) => setEditVendorForm({ ...editVendorForm, contact_name: e.target.value })} />
              <Input label="หมายเหตุ" value={editVendorForm.note} onChange={(e) => setEditVendorForm({ ...editVendorForm, note: e.target.value })} />
              <div className="flex gap-2 pt-2">
                <Button onClick={handleUpdateVendor} disabled={saving} loading={saving} className="flex-1">บันทึก</Button>
                <Button variant="secondary" onClick={() => setShowEditVendor(null)} className="flex-1">ยกเลิก</Button>
              </div>
            </div>
      </Modal>

      <Modal
        open={!!confirmState}
        onClose={() => setConfirmState(null)}
        title={confirmState?.title}
        className="max-w-sm"
      >
        {confirmState && (
          <div>
            <p className="text-sm text-[#555]">{confirmState.message}</p>
            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setConfirmState(null)}>ยกเลิก</Button>
              <Button variant="danger" onClick={() => { const fn = confirmState.onConfirm; setConfirmState(null); fn(); }}>ลบ</Button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
