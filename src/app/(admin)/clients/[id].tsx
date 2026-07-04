import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import {
  createAdminClientMember,
  deleteAdminClient,
  getAdminClientUser,
  listAdminClientMembers,
  resetAdminClientWorkspace,
  resetAllClientData,
  resetClientDocuments,
  updateAdminClientMember,
  updateAdminClientPassword,
  updateAdminClientStatus,
  type AdminClientMember,
} from "../../../lib/adminApi";
import { supabase } from "../../../lib/supabase";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { Modal } from "../../../components/ui/Modal";
import { Input, Select } from "../../../components/ui/Input";
import { SortableTh } from "../../../components/ui/SortableTh";
import { useTableSort } from "../../../components/ui/useTableSort";
import { useToast } from "../../../hooks/useToast";
import { formatBuddhistDate } from "../../../lib/dates";
import { CLIENT_FEATURES } from "../../../lib/features";
import { getWorkspacePermissions, PERMISSION_GROUPS, type WorkspacePermissions } from "../../../lib/permissions";
import { DOC_TYPE_LABELS, STATUS_COLORS, STATUS_LABELS } from "../../../constants";
import type { ClientFeature, ClientFeatureKey, ClientProfile, Document } from "../../../types";

const CARD_LABEL = "text-[11px] uppercase font-semibold text-[#888780] tracking-wide";

export default function AdminClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [email, setEmail] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [features, setFeatures] = useState<ClientFeature[]>([]);
  const [members, setMembers] = useState<AdminClientMember[]>([]);
  const [dealCount, setDealCount] = useState(0);
  const [activeCustomerCount, setActiveCustomerCount] = useState(0);
  const [activeItemCount, setActiveItemCount] = useState(0);
  const [activeDealCount, setActiveDealCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [togglingDev, setTogglingDev] = useState(false);
  const [togglingFeature, setTogglingFeature] = useState<ClientFeatureKey | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showWorkspaceResetModal, setShowWorkspaceResetModal] = useState(false);
  const [workspaceResetConfirm, setWorkspaceResetConfirm] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showResetAllModal, setShowResetAllModal] = useState(false);
  const [resetAllConfirm, setResetAllConfirm] = useState("");
  const [resettingAll, setResettingAll] = useState(false);
  const [showResetDocsModal, setShowResetDocsModal] = useState(false);
  const [resetDocsConfirm, setResetDocsConfirm] = useState("");
  const [resettingDocs, setResettingDocs] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"manager" | "officer">("manager");
  const [memberPassword, setMemberPassword] = useState("");
  const [creatingMember, setCreatingMember] = useState(false);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [permissionMember, setPermissionMember] = useState<AdminClientMember | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<WorkspacePermissions | null>(null);
  const [savingPermissions, setSavingPermissions] = useState(false);

  useEffect(() => {
    if (!id) return;
    void fetchData();
  }, [id]);

  async function fetchData() {
    if (!id) return;

    setLoading(true);

    const [cpRes, docRes, dealRes, userRes, activeCustomerRes, activeItemRes, activeDealRes, featureRes, memberRes] = await Promise.all([
      supabase.from("client_profiles").select("*").eq("user_id", id).single(),
      supabase
        .from("documents")
        .select("*, customer:customer_id(name)")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("deals").select("*", { count: "exact", head: true }).eq("user_id", id),
      getAdminClientUser(id),
      supabase.from("customers").select("*", { count: "exact", head: true }).eq("user_id", id).eq("is_active", true),
      supabase.from("items").select("*", { count: "exact", head: true }).eq("user_id", id).eq("is_active", true),
      supabase.from("deals").select("*", { count: "exact", head: true }).eq("user_id", id).eq("is_active", true),
      supabase.from("client_features").select("*").eq("user_id", id),
      listAdminClientMembers(id).catch(() => []),
    ]);

    if (!cpRes.error && cpRes.data) {
      setClientProfile(cpRes.data as ClientProfile);
    }
    if (!docRes.error && docRes.data) {
      setDocuments(docRes.data as unknown as Document[]);
    }
    if (!dealRes.error) {
      setDealCount(dealRes.count || 0);
    }
    if (!activeCustomerRes.error) {
      setActiveCustomerCount(activeCustomerRes.count || 0);
    }
    if (!activeItemRes.error) {
      setActiveItemCount(activeItemRes.count || 0);
    }
    if (!activeDealRes.error) {
      setActiveDealCount(activeDealRes.count || 0);
    }
    if (!featureRes.error && featureRes.data) {
      setFeatures(featureRes.data as ClientFeature[]);
    }
    setMembers(memberRes);

    setEmail(userRes.email || "");
    setIsActive(userRes.isActive);
    setLoading(false);
  }

  function handleImpersonate() {
    if (!id || !clientProfile) return;
    sessionStorage.setItem("impersonate_user_id", id);
    sessionStorage.setItem("impersonate_name", clientProfile.company_name_th);
    sessionStorage.setItem("impersonate_return", `/admin/clients/${id}`);
    navigate("/home", { replace: true });
  }

  function handleStopImpersonate() {
    sessionStorage.removeItem("impersonate_user_id");
    sessionStorage.removeItem("impersonate_name");
    sessionStorage.removeItem("impersonate_return");
  }

  async function handleResetPassword() {
    if (!email) return;
    if (!window.confirm(`ส่งอีเมลรีเซ็ตรหัสผ่านให้ ${email}?`)) return;

    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("ส่งอีเมลรีเซ็ตรหัสผ่านแล้ว ✓");
    }
    setResetting(false);
  }

  async function handleChangePassword() {
    if (!id) return;
    if (!newPassword || newPassword.length < 6) {
      toast.error("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      toast.error("รหัสผ่านไม่ตรงกัน");
      return;
    }

    setChangingPassword(true);
    try {
      await updateAdminClientPassword(id, newPassword);
      toast.success("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว ✓");
      setShowPasswordModal(false);
      setNewPassword("");
      setNewPasswordConfirm("");
    } catch (error: any) {
      toast.error(error.message || "Unable to change password");
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleToggleActive() {
    if (!id) return;

    const confirmMsg = isActive
      ? `ปิดการใช้งานบัญชีของ ${clientProfile?.company_name_th || email}? ลูกค้าจะไม่สามารถเข้าสู่ระบบได้`
      : `เปิดใช้งานบัญชีของ ${clientProfile?.company_name_th || email}?`;

    if (!window.confirm(confirmMsg)) return;

    setToggling(true);
    setShowMenu(false);

    try {
      await updateAdminClientStatus(id, !isActive);
      setIsActive(!isActive);
      toast.success(isActive ? "ปิดการใช้งานบัญชีแล้ว" : "เปิดใช้งานบัญชีแล้ว");
    } catch (error: any) {
      toast.error(error.message || "Unable to update account status");
    } finally {
      setToggling(false);
    }
  }

  async function handleToggleDevMode() {
    if (!id) return;
    setTogglingDev(true);
    try {
      const newValue = !clientProfile?.dev_mode_enabled;
      await supabase.rpc("toggle_dev_mode", { p_user_id: id, p_enabled: newValue });
      setClientProfile((prev) => prev ? { ...prev, dev_mode_enabled: newValue } : prev);
      toast.success(newValue ? "เปิด Dev Mode แล้ว" : "ปิด Dev Mode แล้ว");
    } catch (error: any) {
      toast.error(error.message || "Unable to toggle dev mode");
    } finally {
      setTogglingDev(false);
    }
  }

  async function handleToggleFeature(featureKey: ClientFeatureKey) {
    if (!id) return;
    const current = features.find((feature) => feature.feature_key === featureKey);
    const nextEnabled = !current?.enabled;
    setTogglingFeature(featureKey);

    try {
      const { data, error } = await supabase
        .from("client_features")
        .upsert(
          {
            user_id: id,
            feature_key: featureKey,
            enabled: nextEnabled,
          },
          { onConflict: "user_id,feature_key" },
        )
        .select("*")
        .single();

      if (error) throw error;

      setFeatures((prev) => {
        const next = prev.filter((feature) => feature.feature_key !== featureKey);
        return [...next, data as ClientFeature];
      });
      toast.success(nextEnabled ? "เปิด Business Feature แล้ว" : "ปิด Business Feature แล้ว");
    } catch (error: any) {
      toast.error(error.message || "Unable to toggle business feature");
    } finally {
      setTogglingFeature(null);
    }
  }

  async function handleCreateMember() {
    if (!id) return;
    if (!memberEmail.trim()) {
      toast.error("กรุณากรอกอีเมล");
      return;
    }
    if (memberPassword && memberPassword.length < 6) {
      toast.error("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }

    setCreatingMember(true);
    try {
      const result = await createAdminClientMember(id, {
        email: memberEmail.trim(),
        role: memberRole,
        password: memberPassword.trim() || undefined,
      });
      setMembers((prev) => [...prev, result.member]);
      setShowAddMemberModal(false);
      setMemberEmail("");
      setMemberRole("manager");
      setMemberPassword("");
      toast.success("เพิ่มพนักงานแล้ว");
    } catch (error: any) {
      toast.error(error.message || "Unable to add staff member");
    } finally {
      setCreatingMember(false);
    }
  }

  async function handleUpdateMember(member: AdminClientMember, patch: { role?: "owner" | "manager" | "officer"; status?: "active" | "disabled"; permissions?: Partial<WorkspacePermissions> | null }) {
    if (!id) return;
    setMemberActionId(member.id);
    try {
      await updateAdminClientMember(id, member.id, patch);
      setMembers((prev) => prev.map((item) => (item.id === member.id ? { ...item, ...patch, isActive: patch.status ? patch.status === "active" : item.isActive } : item)));
      toast.success("อัปเดตทีมแล้ว");
    } catch (error: any) {
      toast.error(error.message || "Unable to update staff member");
    } finally {
      setMemberActionId(null);
    }
  }

  function openPermissionEditor(member: AdminClientMember) {
    setPermissionMember(member);
    setPermissionDraft(getWorkspacePermissions(member.role, member.permissions as Partial<WorkspacePermissions> | null));
  }

  function setPermissionValue(key: keyof WorkspacePermissions, value: boolean) {
    setPermissionDraft((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  async function handleSavePermissions() {
    if (!id || !permissionMember || !permissionDraft) return;
    setSavingPermissions(true);
    try {
      await updateAdminClientMember(id, permissionMember.id, { permissions: permissionDraft });
      setMembers((prev) => prev.map((member) => (
        member.id === permissionMember.id ? { ...member, permissions: permissionDraft } : member
      )));
      setPermissionMember(null);
      setPermissionDraft(null);
      toast.success("อัปเดตสิทธิ์แล้ว");
    } catch (error: any) {
      toast.error(error.message || "Unable to update permissions");
    } finally {
      setSavingPermissions(false);
    }
  }

  async function handleArchiveAndResetWorkspace() {
    if (!id || !clientProfile) return;

    const expected = clientProfile.company_name_th?.trim() || email.trim();
    if (!expected) {
      toast.error("ไม่พบชื่อบริษัทสำหรับยืนยัน");
      return;
    }

    if (workspaceResetConfirm.trim() !== expected) {
      toast.error("ชื่อยืนยันไม่ตรงกัน");
      return;
    }

    setResetting(true);
    try {
      await resetAdminClientWorkspace(id);
      setShowWorkspaceResetModal(false);
      setWorkspaceResetConfirm("");
      toast.success("Archive workspace and reset numbering completed");
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || "Reset workspace failed");
    } finally {
      setResetting(false);
    }
  }

  async function handleResetAllData() {
    if (!id || !clientProfile) return;

    const expected = clientProfile.company_name_th?.trim() || email.trim();
    if (resetAllConfirm.trim() !== expected) {
      toast.error("ชื่อยืนยันไม่ตรงกัน");
      return;
    }

    setResettingAll(true);
    try {
      await resetAllClientData(id);
      setShowResetAllModal(false);
      setResetAllConfirm("");
      toast.success("ล้างข้อมูลทั้งหมดเรียบร้อยแล้ว");
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || "Reset all data failed");
    } finally {
      setResettingAll(false);
    }
  }

  async function handleResetDocuments() {
    if (!id || !clientProfile) return;

    const expected = clientProfile.company_name_th?.trim() || email.trim();
    if (resetDocsConfirm.trim() !== expected) {
      toast.error("ชื่อยืนยันไม่ตรงกัน");
      return;
    }

    setResettingDocs(true);
    try {
      await resetClientDocuments(id);
      setShowResetDocsModal(false);
      setResetDocsConfirm("");
      toast.success("ล้างเอกสารและตั้งเลขใหม่เรียบร้อยแล้ว");
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || "Reset documents failed");
    } finally {
      setResettingDocs(false);
    }
  }

  async function handleDeleteClient() {
    if (!id || !clientProfile) return;

    const expected = clientProfile.company_name_th?.trim() || email.trim();
    if (deleteConfirm.trim() !== expected) {
      toast.error("ชื่อยืนยันไม่ตรงกัน");
      return;
    }

    setDeleting(true);
    try {
      await deleteAdminClient(id);
      setShowDeleteModal(false);
      toast.success("ลบข้อมูลลูกค้าทั้งหมดเรียบร้อยแล้ว");
      navigate("/admin/clients", { replace: true });
    } catch (error: any) {
      toast.error(error.message || "ไม่สามารถลบข้อมูลลูกค้าได้");
    } finally {
      setDeleting(false);
    }
  }

  type AdminDocSortKey = "doc_number" | "doc_type" | "total_amount" | "status";
  const adminDocSort = useTableSort<Document, AdminDocSortKey>(documents, { key: "doc_number", dir: "asc" });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F6F3]">
        <header className="sticky top-0 z-30 border-b border-[#E8E6DF] bg-white/90 backdrop-blur-sm">
          <div className="flex items-center px-4 h-14 max-w-4xl mx-auto">
            <button onClick={() => navigate("/admin/clients")} className="text-gray-500 hover:text-gray-700 p-1">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-sm font-semibold text-gray-800 ml-2">ข้อมูลลูกค้า</h1>
          </div>
        </header>
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Spinner />
        </div>
      </div>
    );
  }

  if (!clientProfile) {
    return (
      <div className="min-h-screen bg-[#F7F6F3]">
        <header className="sticky top-0 z-30 border-b border-[#E8E6DF] bg-white/90 backdrop-blur-sm">
          <div className="flex items-center px-4 h-14 max-w-4xl mx-auto">
            <button onClick={() => navigate("/admin/clients")} className="text-gray-500 hover:text-gray-700 p-1">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-sm font-semibold text-gray-800 ml-2">ไม่พบข้อมูล</h1>
          </div>
        </header>
        <div className="max-w-4xl mx-auto px-4 py-4">
          <p className="text-sm text-gray-500">ไม่พบข้อมูลลูกค้า</p>
        </div>
      </div>
    );
  }

  const isImpersonating = sessionStorage.getItem("impersonate_user_id") === id;
  const confirmName = clientProfile.company_name_th?.trim() || email.trim();
  const enabledFeatureKeys = new Set(
    features.filter((feature) => feature.enabled).map((feature) => feature.feature_key),
  );
  const roleLabels: Record<AdminClientMember["role"], string> = {
    owner: "Owner",
    manager: "Manager",
    officer: "Officer",
  };

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      <header className="sticky top-0 z-30 border-b border-[#E8E6DF] bg-white/90 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 h-14 max-w-4xl mx-auto">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/admin/clients")} className="text-gray-500 hover:text-gray-700 p-1">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-sm font-semibold text-[#1A1A18] truncate">
              {clientProfile.company_name_th || email || "ลูกค้า"}
            </h1>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowMenu((value) => !value)}
              className="text-gray-500 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-[#E8E6DF] rounded-lg shadow-lg py-1 min-w-[180px] z-50">
                <button
                  onClick={handleToggleActive}
                  disabled={toggling}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  {isActive ? "ปิดการใช้งานบัญชี" : "เปิดใช้งานบัญชี"}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {isImpersonating && (
        <div className="bg-[#FAEEDA] border-b border-[#E8D5B2] text-[#633806] px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => {
                handleStopImpersonate();
                window.location.reload();
              }}
              className="flex items-center gap-1 text-[#633806] font-medium text-sm hover:underline shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              หยุดดูในฐานะลูกค้า
            </button>
          </div>
          <span className="text-sm text-[#633806]/80 truncate ml-2">
            กำลังดูในฐานะ: <strong>{clientProfile.company_name_th}</strong>
          </span>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        <div className={CARD_LABEL}>ข้อมูลลูกค้า</div>

        <Card>
          <div className="space-y-2">
            <div>
              <span className="text-[11px] text-[#888780]">ชื่อบริษัท</span>
              <p className="text-[13px] text-[#1A1A18] font-medium">{clientProfile.company_name_th || "-"}</p>
            </div>
            {clientProfile.company_name_en && (
              <div>
                <span className="text-[11px] text-[#888780]">ชื่อบริษัท (EN)</span>
                <p className="text-[13px] text-[#1A1A18]">{clientProfile.company_name_en}</p>
              </div>
            )}
            <div>
              <span className="text-[11px] text-[#888780]">อีเมล</span>
              <p className="text-[13px] text-[#1A1A18]">{email || "-"}</p>
            </div>
            {clientProfile.tax_id && (
              <div>
                <span className="text-[11px] text-[#888780]">เลขผู้เสียภาษี</span>
                <p className="text-[13px] text-[#1A1A18]">{clientProfile.tax_id}</p>
              </div>
            )}
            {clientProfile.address && (
              <div>
                <span className="text-[11px] text-[#888780]">ที่อยู่</span>
                <p className="text-[13px] text-[#1A1A18]">{clientProfile.address}</p>
              </div>
            )}
            {clientProfile.phone && (
              <div>
                <span className="text-[11px] text-[#888780]">โทร</span>
                <p className="text-[13px] text-[#1A1A18]">{clientProfile.phone}</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-4 pt-2 border-t border-[#E8E6DF]">
              <div>
                <span className="text-[11px] text-[#888780]">VAT</span>
                <p className="text-[13px] text-[#1A1A18]">
                  {clientProfile.vat_registered ? "จดทะเบียน" : "ไม่ได้จด"}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-[#888780]">WHT เริ่มต้น</span>
                <p className="text-[13px] text-[#1A1A18]">
                  {clientProfile.default_wht_rate === "0" ? "ไม่มี" : `${clientProfile.default_wht_rate}%`}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-[#888780]">สถานะ</span>
                <p className="text-[13px]">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${
                      isActive ? "bg-[#EAF3DE] text-[#27500A]" : "bg-[#F1EFE8] text-[#888780]"
                    }`}
                  >
                    {isActive ? "ใช้งานอยู่" : "ปิดการใช้งาน"}
                  </span>
                </p>
              </div>
            </div>
            <div className="pt-1">
              <span className="text-[11px] text-[#888780]">สร้างบัญชีเมื่อ: {formatBuddhistDate(clientProfile.created_at)}</span>
              <span className="text-[11px] text-[#888780] ml-4">เอกสารทั้งหมด: {documents.length >= 10 ? "10+" : documents.length}</span>
              <span className="text-[11px] text-[#888780] ml-4">งานขาย: {dealCount}</span>
            </div>
          </div>
        </Card>

        <div className={CARD_LABEL}>Business Features</div>

        <Card>
          <div className="space-y-3">
            {CLIENT_FEATURES.map((feature) => {
              const enabled = enabledFeatureKeys.has(feature.key);
              return (
                <div key={feature.key} className="rounded-lg border border-[#E8E6DF] bg-[#FBFAF7] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[#1A1A18]">{feature.label}</div>
                      <p className="mt-1 text-xs leading-5 text-[#888780]">{feature.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleFeature(feature.key)}
                      disabled={togglingFeature === feature.key}
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        enabled
                          ? "bg-[#E7F6EC] text-[#1E5A38] hover:bg-[#D8F0E0]"
                          : "bg-[#F1F2F4] text-[#5F5A52] hover:bg-[#E8E6DF]"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {togglingFeature === feature.key ? "..." : enabled ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className={CARD_LABEL}>Team Members</div>

        <Card>
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-[#1A1A18]">Owner, manager, officer</div>
                <p className="mt-1 text-xs leading-5 text-[#888780]">
                  Admin-managed staff access for this client workspace. Owner keeps settings control; managers operate documents; officers prepare drafts.
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setMemberEmail("");
                  setMemberRole("manager");
                  setMemberPassword("");
                  setShowAddMemberModal(true);
                }}
              >
                Add staff
              </Button>
            </div>

            <div className="divide-y divide-[#E8E6DF] rounded-lg border border-[#E8E6DF] bg-white">
              {members.length === 0 ? (
                <div className="px-3 py-4 text-sm text-[#888780]">No team members yet.</div>
              ) : (
                members.map((member) => {
                  const isOwner = member.memberUserId === id || member.role === "owner";
                  return (
                    <div key={member.id} className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-[#1A1A18]">{member.email || "-"}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#888780]">
                          <span>{roleLabels[member.role]}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              member.status === "active" ? "bg-[#EAF3DE] text-[#27500A]" : "bg-[#F1EFE8] text-[#6F6A61]"
                            }`}
                          >
                            {member.status === "active" ? "Active" : "Disabled"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={member.role}
                          disabled={isOwner || memberActionId === member.id}
                          onChange={(event) => {
                            const nextRole = event.target.value as AdminClientMember["role"];
                            handleUpdateMember(member, {
                              role: nextRole,
                              permissions: getWorkspacePermissions(nextRole),
                            });
                          }}
                          className="rounded-lg border border-card-border bg-white px-3 py-1.5 text-xs text-gray-700 disabled:bg-gray-50 disabled:text-gray-400"
                        >
                          <option value="owner">Owner</option>
                          <option value="manager">Manager</option>
                          <option value="officer">Officer</option>
                        </select>
                        {!isOwner && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => openPermissionEditor(member)}
                            >
                              Access
                            </Button>
                            <Button
                              size="sm"
                              variant={member.status === "active" ? "danger" : "secondary"}
                              loading={memberActionId === member.id}
                              onClick={() => handleUpdateMember(member, { status: member.status === "active" ? "disabled" : "active" })}
                            >
                              {member.status === "active" ? "Disable" : "Enable"}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </Card>

        <div className={CARD_LABEL}>การจัดการ</div>

        <Card>
          <div className="space-y-2">
            <Button
              onClick={handleImpersonate}
              className="w-full"
              style={{ backgroundColor: "#E6F1FB", color: "#0C447C", border: "0.5px solid #378ADD" }}
            >
              ดูในฐานะลูกค้า
            </Button>

            <Button variant="secondary" className="w-full" onClick={handleResetPassword} disabled={resetting || !email}>
              {resetting ? "กำลังส่งอีเมล..." : "รีเซ็ตรหัสผ่าน (ส่งอีเมล)"}
            </Button>

            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setNewPassword("");
                setNewPasswordConfirm("");
                setShowPasswordModal(true);
              }}
              disabled={!id}
            >
              เปลี่ยนรหัสผ่าน (กำหนดเอง)
            </Button>

            <Button variant="secondary" className="w-full text-[#C0392B] border-[#C0392B]/20 hover:bg-red-50" onClick={handleToggleActive} disabled={toggling}>
              {toggling ? "กำลังดำเนินการ..." : isActive ? "ปิดการใช้งานบัญชี" : "เปิดใช้งานบัญชี"}
            </Button>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Dev Mode</div>
              <p className="mt-1 text-sm leading-6 text-amber-900">
                Allow client to freely edit document numbers (invoice number, receipt number, etc.).
                Currently: <strong>{clientProfile?.dev_mode_enabled ? "ON" : "OFF"}</strong>
              </p>
              <Button
                variant={clientProfile?.dev_mode_enabled ? "danger" : "secondary"}
                className="mt-3 w-full justify-center"
                onClick={handleToggleDevMode}
                disabled={togglingDev}
              >
                {togglingDev ? "..." : clientProfile?.dev_mode_enabled ? "Disable Dev Mode" : "Enable Dev Mode"}
              </Button>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Start New Workspace</div>
              <p className="mt-1 text-sm leading-6 text-amber-900">
                Archive active deals, customers, and catalog items for this client, then reset document numbering to start from the beginning again.
                Old documents remain available as history.
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-amber-900/80">
                <div>Active deals: {activeDealCount}</div>
                <div>Active customers: {activeCustomerCount}</div>
                <div>Active items: {activeItemCount}</div>
              </div>
              <Button
                variant="danger"
                className="mt-3 w-full justify-center"
                onClick={() => {
                  setWorkspaceResetConfirm("");
                  setShowWorkspaceResetModal(true);
                }}
              >
                Archive workspace and reset numbering
              </Button>
            </div>

            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-orange-800">Clear Documents &amp; Numbering</div>
              <p className="mt-1 text-sm leading-6 text-orange-900">
                Delete all documents, deals, and stock movements for this client.
                Document numbering will be reset to 1. Customers, catalog items, and
                profile settings are preserved. This action cannot be undone.
              </p>
              <Button
                variant="danger"
                className="mt-3 w-full justify-center"
                onClick={() => {
                  setResetDocsConfirm("");
                  setShowResetDocsModal(true);
                }}
              >
                Clear all documents and numbering
              </Button>
            </div>

            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-orange-800">Reset All Data</div>
              <p className="mt-1 text-sm leading-6 text-orange-900">
                Permanently delete all documents, deals, customers, catalog items, and stock history.
                Number sequences will be reset. The client account and profile settings are preserved.
                This action cannot be undone.
              </p>
              <Button
                variant="danger"
                className="mt-3 w-full justify-center"
                onClick={() => {
                  setResetAllConfirm("");
                  setShowResetAllModal(true);
                }}
              >
                Reset all data to empty
              </Button>
            </div>

            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-red-800">Delete Client</div>
              <p className="mt-1 text-sm leading-6 text-red-900">
                Permanently delete this client, all their documents, customers, items, and account data.
                This action cannot be undone.
              </p>
              <Button
                variant="danger"
                className="mt-3 w-full justify-center"
                onClick={() => {
                  setDeleteConfirm("");
                  setShowDeleteModal(true);
                }}
              >
                Delete client permanently
              </Button>
            </div>
          </div>
        </Card>

        <div className={CARD_LABEL}>เอกสารล่าสุด ({documents.length >= 10 ? "10+" : documents.length} รายการ)</div>

        <Card>
          {documents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">ยังไม่มีเอกสาร</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[#E8E6DF] text-[#888780]">
                    <SortableTh
                      label="เลขที่"
                      align="left"
                      active={adminDocSort.sort.key === "doc_number"}
                      dir={adminDocSort.sort.dir}
                      onClick={() => adminDocSort.handleSort("doc_number")}
                      className="!text-[#888780] !text-[12px] !font-normal !py-2 !pr-2 !pl-0"
                    />
                    <SortableTh
                      label="ประเภท"
                      align="left"
                      active={adminDocSort.sort.key === "doc_type"}
                      dir={adminDocSort.sort.dir}
                      onClick={() => adminDocSort.handleSort("doc_type")}
                      className="!text-[#888780] !text-[12px] !font-normal !py-2 !pr-2 !pl-0"
                    />
                    <th className="text-left py-2 pr-2">ลูกค้า</th>
                    <SortableTh
                      label="ยอดรวม"
                      align="right"
                      active={adminDocSort.sort.key === "total_amount"}
                      dir={adminDocSort.sort.dir}
                      onClick={() => adminDocSort.handleSort("total_amount")}
                      className="!text-[#888780] !text-[12px] !font-normal !py-2 !pr-2 !pl-0"
                    />
                    <SortableTh
                      label="สถานะ"
                      align="left"
                      active={adminDocSort.sort.key === "status"}
                      dir={adminDocSort.sort.dir}
                      onClick={() => adminDocSort.handleSort("status")}
                      className="!text-[#888780] !text-[12px] !font-normal !py-2 !pl-0"
                    />
                  </tr>
                </thead>
                <tbody>
                  {adminDocSort.sorted.map((document) => (
                    <tr key={document.id} className="border-b border-[#E8E6DF]/50 hover:bg-gray-50 cursor-pointer">
                      <td className="py-2 pr-2 font-medium">{document.doc_number || "-"}</td>
                      <td className="py-2 pr-2">{DOC_TYPE_LABELS[document.doc_type]?.th || document.doc_type}</td>
                      <td className="py-2 pr-2 text-[#888780]">{(document as any).customer?.name || "-"}</td>
                      <td className="py-2 pr-2 text-right">฿ {document.total_amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                      <td className="py-2">
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium ${
                            STATUS_COLORS[document.status]?.bg || "bg-[#F1EFE8]"
                          } ${STATUS_COLORS[document.status]?.text || "text-[#444441]"}`}
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

      <Modal
        open={showAddMemberModal}
        onClose={() => {
          if (!creatingMember) setShowAddMemberModal(false);
        }}
        title="Add staff member"
      >
        <div className="space-y-3">
          <Input
            label="Email"
            type="email"
            value={memberEmail}
            onChange={(event) => setMemberEmail(event.target.value)}
            placeholder="staff@example.com"
          />
          <Select
            label="Role"
            value={memberRole}
            onChange={(event) => setMemberRole(event.target.value as "manager" | "officer")}
          >
            <option value="manager">Manager - documents, payments, reports</option>
            <option value="officer">Officer - draft preparation only</option>
          </Select>
          <Input
            label="Temporary password (optional)"
            type="password"
            value={memberPassword}
            onChange={(event) => setMemberPassword(event.target.value)}
            placeholder="Leave blank to use invite email"
          />
          <div className="rounded-lg border border-[#E8E6DF] bg-[#FBFAF7] p-3 text-xs leading-5 text-[#6F6A61]">
            Staff users share this client's customers, catalog, documents, and numbering. They do not get their own company profile.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowAddMemberModal(false)} disabled={creatingMember}>
              Cancel
            </Button>
            <Button onClick={handleCreateMember} loading={creatingMember}>
              Add staff
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!permissionMember}
        onClose={() => {
          if (!savingPermissions) {
            setPermissionMember(null);
            setPermissionDraft(null);
          }
        }}
        title="Customize access"
      >
        {permissionMember && permissionDraft && (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#E8E6DF] bg-[#FBFAF7] p-3">
              <div className="text-sm font-medium text-[#1A1A18]">{permissionMember.email}</div>
              <p className="mt-1 text-xs leading-5 text-[#888780]">
                Role: {roleLabels[permissionMember.role]}. These toggles override the default access for this staff member only.
              </p>
            </div>

            <div className="space-y-2">
              {PERMISSION_GROUPS.filter((permission) => permission.key !== "canManageTeam").map((permission) => {
                const checked = Boolean(permissionDraft[permission.key]);
                return (
                  <label
                    key={permission.key}
                    className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-[#E8E6DF] bg-white p-3 hover:bg-[#FBFAF7]"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[#1A1A18]">{permission.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-[#888780]">{permission.description}</span>
                    </span>
                    <span
                      className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                        checked ? "bg-[#378ADD]" : "bg-[#D8D5CE]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => setPermissionValue(permission.key, event.target.checked)}
                        className="sr-only"
                      />
                      <span
                        className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                          checked ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button
                variant="ghost"
                onClick={() => setPermissionDraft(getWorkspacePermissions(permissionMember.role))}
                disabled={savingPermissions}
              >
                Reset to role default
              </Button>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPermissionMember(null);
                    setPermissionDraft(null);
                  }}
                  disabled={savingPermissions}
                >
                  Cancel
                </Button>
                <Button onClick={handleSavePermissions} loading={savingPermissions}>
                  Save access
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={showWorkspaceResetModal}
        onClose={() => {
          if (!resetting) {
            setShowWorkspaceResetModal(false);
            setWorkspaceResetConfirm("");
          }
        }}
        title="Archive workspace and reset numbering"
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-gray-700">
            This will hide the client&apos;s active workspace from normal day-to-day screens by archiving active deals, customers, and items.
            It will also reset document numbering back to the start. Existing documents remain in the database as history.
          </p>
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
            <div>Active deals to archive: {activeDealCount}</div>
            <div>Active customers to archive: {activeCustomerCount}</div>
            <div>Active items to archive: {activeItemCount}</div>
          </div>
          <Input
            id="workspace-reset-confirm"
            label={`Type "${confirmName}" to confirm`}
            value={workspaceResetConfirm}
            onChange={(event) => setWorkspaceResetConfirm(event.target.value)}
            placeholder={confirmName}
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setShowWorkspaceResetModal(false);
                setWorkspaceResetConfirm("");
              }}
              disabled={resetting}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleArchiveAndResetWorkspace} loading={resetting} disabled={workspaceResetConfirm.trim() !== confirmName}>
              Confirm reset
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showResetDocsModal}
        onClose={() => {
          if (!resettingDocs) {
            setShowResetDocsModal(false);
            setResetDocsConfirm("");
          }
        }}
        title="Clear documents and numbering"
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-gray-700">
            This will permanently delete all documents, deals, and stock movements for
            this client. Document numbering will be reset to start from 1.
          </p>
          <p className="text-sm leading-6 text-gray-700 font-medium">
            The following will be preserved:
          </p>
          <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
            <li>Customers ({activeCustomerCount} active)</li>
            <li>Catalog items ({activeItemCount} active)</li>
            <li>Profile settings (company name, tax ID, logo, etc.)</li>
          </ul>
          <p className="text-sm font-semibold text-amber-700">This action cannot be undone. The documents will be permanently deleted.</p>
          <Input
            id="reset-docs-confirm"
            label={`Type "${confirmName}" to confirm`}
            value={resetDocsConfirm}
            onChange={(event) => setResetDocsConfirm(event.target.value)}
            placeholder={confirmName}
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setShowResetDocsModal(false);
                setResetDocsConfirm("");
              }}
              disabled={resettingDocs}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleResetDocuments} loading={resettingDocs} disabled={resetDocsConfirm.trim() !== confirmName}>
              Clear all documents
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showResetAllModal}
        onClose={() => {
          if (!resettingAll) {
            setShowResetAllModal(false);
            setResetAllConfirm("");
          }
        }}
        title="Reset all client data"
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-gray-700">
            This will permanently delete all documents, deals, customers, catalog items,
            and stock history for this client. Document numbering will be reset to defaults.
            The client account and profile settings (company name, tax ID, logo, PDF template, etc.)
            will be preserved. This action cannot be undone.
          </p>
          <Input
            id="reset-all-confirm"
            label={`Type "${confirmName}" to confirm`}
            value={resetAllConfirm}
            onChange={(event) => setResetAllConfirm(event.target.value)}
            placeholder={confirmName}
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setShowResetAllModal(false);
                setResetAllConfirm("");
              }}
              disabled={resettingAll}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleResetAllData} loading={resettingAll} disabled={resetAllConfirm.trim() !== confirmName}>
              Delete all data
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showDeleteModal}
        onClose={() => {
          if (!deleting) {
            setShowDeleteModal(false);
            setDeleteConfirm("");
          }
        }}
        title="Delete client permanently"
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-gray-700">
            This will <strong className="text-red-600">permanently delete</strong> the client{" "}
            <strong>{clientProfile.company_name_th || email}</strong>, including:
          </p>
          <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
            <li>All documents ({dealCount} deals, {documents.length} recent docs)</li>
            <li>All customers ({activeCustomerCount} active)</li>
            <li>All catalog items ({activeItemCount} active)</li>
            <li>Company profile, settings, and numbering</li>
            <li>Login account ({email})</li>
          </ul>
          <p className="text-sm font-semibold text-red-600">This action is irreversible. The data cannot be recovered.</p>
          <Input
            id="delete-confirm"
            label={`Type "${confirmName}" to confirm deletion`}
            value={deleteConfirm}
            onChange={(event) => setDeleteConfirm(event.target.value)}
            placeholder={confirmName}
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setDeleteConfirm("");
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteClient} loading={deleting} disabled={deleteConfirm.trim() !== confirmName}>
              Delete permanently
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showPasswordModal}
        onClose={() => {
          if (!changingPassword) {
            setShowPasswordModal(false);
            setNewPassword("");
            setNewPasswordConfirm("");
          }
        }}
        title="เปลี่ยนรหัสผ่าน"
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-gray-700">
            กำหนดรหัสผ่านใหม่ให้กับ <strong>{clientProfile.company_name_th || email}</strong>
          </p>
          <Input
            id="new-password"
            label="รหัสผ่านใหม่"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="รหัสผ่านอย่างน้อย 6 ตัวอักษร"
          />
          <Input
            id="new-password-confirm"
            label="ยืนยันรหัสผ่านใหม่"
            type="password"
            value={newPasswordConfirm}
            onChange={(event) => setNewPasswordConfirm(event.target.value)}
            placeholder="ใส่รหัสผ่านอีกครั้ง"
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setShowPasswordModal(false);
                setNewPassword("");
                setNewPasswordConfirm("");
              }}
              disabled={changingPassword}
            >
              ยกเลิก
            </Button>
            <Button onClick={handleChangePassword} loading={changingPassword} disabled={!newPassword || !newPasswordConfirm}>
              เปลี่ยนรหัสผ่าน
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
