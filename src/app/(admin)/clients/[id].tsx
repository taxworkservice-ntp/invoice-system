import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import {
  createAdminClientMember,
  deleteAdminClient,
  deleteAdminClientMember,
  fetchAdminResetBackupBlob,
  getAdminClientUser,
  listAdminClientAudit,
  listAdminClientMembers,
  listAdminClientRoles,
  listAdminResetBackups,
  previewClientDocumentReset,
  resetAdminClientWorkspace,
  resetAllClientData,
  resetClientDocuments,
  resetMemberPassword,
  updateAdminClientMember,
  updateAdminClientPassword,
  updateAdminClientStatus,
  type AdminAuditEntry,
  type AdminClientMember,
  type AdminResetBackup,
  type ResetDocumentsPreview,
} from "../../../lib/adminApi";
import { downloadBlob, sanitizeFilenamePart } from "../../../lib/download/download";
import type { WorkspaceCustomRole } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";
import { Card } from "../../../components/ui/Card";import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { Modal } from "../../../components/ui/Modal";
import { Input, Select } from "../../../components/ui/Input";
import { SortableTh } from "../../../components/ui/SortableTh";
import { useTableSort } from "../../../components/ui/useTableSort";
import { TABLE } from "../../../lib/tableStyles";
import { useToast } from "../../../hooks/useToast";
import { formatBuddhistDate } from "../../../lib/dates";
import { CLIENT_FEATURES } from "../../../lib/features";
import {
  PERMISSION_GROUPS,
  PERMISSION_SECTIONS,
  getWorkspacePermissions,
  type WorkspacePermissionKey,
  type WorkspacePermissions,
} from "../../../lib/permissions";
import { DOC_TYPE_LABELS, STATUS_COLORS, STATUS_LABELS } from "../../../constants";
import type { ClientFeature, ClientFeatureKey, ClientProfile, Document } from "../../../types";

const CARD_LABEL = "text-label  font-semibold text-ink-300 ";

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "role.change": "เปลี่ยนบทบาท",
  "permissions.update": "ปรับสิทธิ์การเข้าถึง",
  "status.update": "เปลี่ยนสถานะสมาชิก",
  "member.added": "เพิ่มสมาชิกใหม่",
  "member.removed": "ลบสมาชิก",
  "member.password-reset": "รีเซ็ตรหัสผ่านสมาชิก",
  "custom_role.created": "สร้างบทบาทกำหนดเอง",
  "custom_role.updated": "แก้ไขบทบาทกำหนดเอง",
  "custom_role.deleted": "ลบบทบาทกำหนดเอง",
  "client.created": "สร้างลูกค้าใหม่",
  "client.deleted": "ลบลูกค้าถาวร",
  "password.change": "เปลี่ยนรหัสผ่านลูกค้า",
  "login-status.change": "เปิด/ปิดการเข้าสู่ระบบ",
  "reset-workspace": "เริ่ม workspace ใหม่",
  "reset-documents": "ล้างเอกสารและเลขที่",
  "reset-all": "ล้างข้อมูลทั้งหมด",
};

const PERMISSION_META = new Map(PERMISSION_GROUPS.map((group) => [group.key, group]));

export default function AdminClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [email, setEmail] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [accountError, setAccountError] = useState("");
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
  const [resetDocsReason, setResetDocsReason] = useState("");
  const [resetDocsPreview, setResetDocsPreview] = useState<ResetDocumentsPreview | null>(null);
  const [loadingResetPreview, setLoadingResetPreview] = useState(false);
  const [resetBackups, setResetBackups] = useState<AdminResetBackup[]>([]);
  const [downloadingBackupId, setDownloadingBackupId] = useState<string | null>(null);
  const [lastResetBackupId, setLastResetBackupId] = useState<string | null>(null);
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
  const [customRoles, setCustomRoles] = useState<WorkspaceCustomRole[]>([]);
  const [auditEntries, setAuditEntries] = useState<AdminAuditEntry[]>([]);
  const [showResetMemberPasswordModal, setShowResetMemberPasswordModal] = useState(false);
  const [resetMemberTarget, setResetMemberTarget] = useState<AdminClientMember | null>(null);
  const [resetMemberPasswordValue, setResetMemberPasswordValue] = useState("");
  const [resettingMemberPassword, setResettingMemberPassword] = useState(false);
  const [showDeleteMemberModal, setShowDeleteMemberModal] = useState(false);
  const [deleteMemberTarget, setDeleteMemberTarget] = useState<AdminClientMember | null>(null);
  const [deletingMember, setDeletingMember] = useState(false);

  useEffect(() => {
    if (!id) return;
    void fetchData();
  }, [id]);

  async function fetchData() {
    if (!id) return;

    setLoading(true);
    setAccountError("");

    // The auth-user lookup is the only request here that rejects (apiFetch
    // throws on non-2xx). Guard it like members/roles/audit below so one
    // failing call can never blank the whole page — the rest renders
    // partially with an inline notice instead.
    let accountFailure = "";
    const [cpRes, docRes, dealRes, userRes, activeCustomerRes, activeItemRes, activeDealRes, featureRes, memberRes, roleRes, auditRes, backupRes] = await Promise.all([
      supabase.from("client_profiles").select("*").eq("user_id", id).single(),
      supabase
        .from("documents")
        .select("*, customer:customer_id(name)")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("deals").select("*", { count: "exact", head: true }).eq("user_id", id),
      getAdminClientUser(id).catch((error: unknown) => {
        accountFailure = error instanceof Error && error.message ? error.message : "โหลดข้อมูลบัญชีไม่สำเร็จ";
        return null;
      }),
      supabase.from("customers").select("*", { count: "exact", head: true }).eq("user_id", id).eq("is_active", true),
      supabase.from("items").select("*", { count: "exact", head: true }).eq("user_id", id).eq("is_active", true),
      supabase.from("deals").select("*", { count: "exact", head: true }).eq("user_id", id).eq("is_active", true),
      supabase.from("client_features").select("*").eq("user_id", id),
      listAdminClientMembers(id).catch(() => []),
      listAdminClientRoles(id).catch(() => []),
      listAdminClientAudit(id).catch(() => []),
      listAdminResetBackups(id).catch(() => []),
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
    setCustomRoles(roleRes);
    setAuditEntries(auditRes);
    setResetBackups(backupRes);

    if (userRes) {
      setEmail(userRes.email || "");
      setIsActive(userRes.isActive);
    } else {
      setAccountError(accountFailure || "โหลดข้อมูลบัญชีไม่สำเร็จ");
      toast.error(accountFailure || "โหลดข้อมูลบัญชีไม่สำเร็จ");
    }
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

  async function handleUpdateMember(member: AdminClientMember, patch: { role?: "manager" | "officer"; status?: "active" | "disabled"; permissions?: Partial<WorkspacePermissions> | null; roleId?: string | null }) {
    if (!id) return;
    setMemberActionId(member.id);
    try {
      await updateAdminClientMember(id, member.id, patch);
      setMembers((prev) => prev.map((item) => {
        if (item.id !== member.id) return item;
        const next = { ...item, ...patch };
        if (patch.roleId !== undefined) {
          next.customRoleId = patch.roleId;
          next.customRoleName = patch.roleId ? customRoles.find((role) => role.id === patch.roleId)?.name ?? null : null;
        }
        if (patch.status) {
          next.isActive = patch.status === "active";
        }
        return next;
      }));
      toast.success("อัปเดตทีมแล้ว");
    } catch (error: any) {
      toast.error(error.message || "Unable to update staff member");
    } finally {
      setMemberActionId(null);
    }
  }

  async function handleResetMemberPassword() {
    if (!id || !resetMemberTarget) return;
    if (!resetMemberPasswordValue || resetMemberPasswordValue.length < 6) {
      toast.error("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }
    setResettingMemberPassword(true);
    try {
      await resetMemberPassword(id, resetMemberTarget.id, resetMemberPasswordValue);
      toast.success("ตั้งรหัสผ่านใหม่ให้ " + (resetMemberTarget.email || "staff") + " เรียบร้อยแล้ว");
      setShowResetMemberPasswordModal(false);
      setResetMemberTarget(null);
      setResetMemberPasswordValue("");
    } catch (error: any) {
      toast.error(error.message || "Unable to reset password");
    } finally {
      setResettingMemberPassword(false);
    }
  }

  async function handleDeleteMember() {
    if (!id || !deleteMemberTarget) return;
    setDeletingMember(true);
    try {
      await deleteAdminClientMember(id, deleteMemberTarget.id);
      setMembers((prev) => prev.filter((m) => m.id !== deleteMemberTarget.id));
      toast.success("ลบ " + (deleteMemberTarget.email || "staff") + " เรียบร้อยแล้ว");
      setShowDeleteMemberModal(false);
      setDeleteMemberTarget(null);
    } catch (error: any) {
      toast.error(error.message || "Unable to delete staff member");
    } finally {
      setDeletingMember(false);
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

  async function openResetDocsModal() {
    setResetDocsConfirm("");
    setResetDocsReason("");
    setResetDocsPreview(null);
    setShowResetDocsModal(true);
    if (!id) return;

    setLoadingResetPreview(true);
    try {
      const result = await previewClientDocumentReset(id);
      setResetDocsPreview(result.preview);
    } catch (error: any) {
      toast.error(error.message || "Unable to load reset preview");
    } finally {
      setLoadingResetPreview(false);
    }
  }

  async function handleDownloadBackup(backupId: string) {
    if (!id || downloadingBackupId) return;
    setDownloadingBackupId(backupId);
    try {
      const blob = await fetchAdminResetBackupBlob(id, backupId);
      const company = sanitizeFilenamePart(clientProfile?.company_name_th?.trim() || email || "client");
      downloadBlob(blob, `reset-backup_${company}_${backupId.slice(0, 8)}.json`);
      setResetBackups((prev) =>
        prev.map((backup) => (backup.id === backupId ? { ...backup, downloaded_at: new Date().toISOString() } : backup)),
      );
      toast.success("ดาวน์โหลด backup แล้ว");
    } catch (error: any) {
      toast.error(error.message || "Unable to download backup");
    } finally {
      setDownloadingBackupId(null);
    }
  }

  async function handleResetDocuments() {
    if (!id || !clientProfile) return;

    const expected = clientProfile.company_name_th?.trim() || email.trim();
    if (resetDocsConfirm.trim() !== expected) {
      toast.error("ชื่อยืนยันไม่ตรงกัน");
      return;
    }

    const reason = resetDocsReason.trim();
    if (reason.length < 3) {
      toast.error("กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร");
      return;
    }

    setResettingDocs(true);
    try {
      const result = await resetClientDocuments(id, reason);
      const summary = result?.summary;
      setLastResetBackupId(summary?.backup_id || null);
      const summaryText = summary
        ? ` (เอกสาร ${summary.documents_deleted} · งานขาย ${summary.deals_deleted} · คืนสต็อก ${summary.items_stock_restored} รายการ)`
        : "";
      toast.success("ล้างเอกสารและตั้งเลขใหม่เรียบร้อยแล้ว" + summaryText + " · บันทึก backup แล้ว");
      setShowResetDocsModal(false);
      setResetDocsConfirm("");
      setResetDocsReason("");
      setResetDocsPreview(null);
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
      <div className="min-h-screen bg-page-bg">
        <header className="sticky top-0 z-30 border-b border-card-border bg-white/90 backdrop-blur-sm">
          <div className="flex items-center px-4 h-14 max-w-4xl mx-auto">
            <button onClick={() => navigate("/admin/clients")} className="text-ink-500 hover:text-ink-700 p-1">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-body font-semibold text-ink-800 ml-2">ข้อมูลลูกค้า</h1>
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
      <div className="min-h-screen bg-page-bg">
        <header className="sticky top-0 z-30 border-b border-card-border bg-white/90 backdrop-blur-sm">
          <div className="flex items-center px-4 h-14 max-w-4xl mx-auto">
            <button onClick={() => navigate("/admin/clients")} className="text-ink-500 hover:text-ink-700 p-1">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-body font-semibold text-ink-800 ml-2">ไม่พบข้อมูล</h1>
          </div>
        </header>
        <div className="max-w-4xl mx-auto px-4 py-4">
          <p className="text-body text-ink-500">ไม่พบข้อมูลลูกค้า</p>
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
    <div className="min-h-screen bg-page-bg">
      <header className="sticky top-0 z-30 border-b border-card-border bg-white/90 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 h-14 max-w-4xl mx-auto">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/admin/clients")} className="text-ink-500 hover:text-ink-700 p-1">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-body font-semibold text-ink-900 truncate">
              {clientProfile.company_name_th || email || "ลูกค้า"}
            </h1>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowMenu((value) => !value)}
              className="text-ink-500 hover:text-ink-700 p-1 rounded-control hover:bg-ink-50"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-card-border rounded-control py-1 min-w-[180px] z-50">
                <button
                  onClick={handleToggleActive}
                  disabled={toggling}
                  className="w-full text-left px-3 py-2 text-body hover:bg-paper-field disabled:opacity-50"
                >
                  {isActive ? "ปิดการใช้งานบัญชี" : "เปิดใช้งานบัญชี"}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {isImpersonating && (
        <div className="bg-pending-bg border-b border-warning-border text-pending-text px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => {
                handleStopImpersonate();
                window.location.reload();
              }}
              className="flex items-center gap-1 text-pending-text font-medium text-body hover:underline shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              หยุดดูในฐานะลูกค้า
            </button>
          </div>
          <span className="text-body text-pending-text/80 truncate ml-2">
            กำลังดูในฐานะ: <strong>{clientProfile.company_name_th}</strong>
          </span>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        <div className={CARD_LABEL}>ข้อมูลลูกค้า</div>

        {accountError && (
          <div className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2.5 text-label leading-5 text-amber-900">
            <span className="font-medium">โหลดข้อมูลบัญชีไม่สำเร็จ:</span> {accountError}
            <span className="text-amber-800/80"> ข้อมูลอื่นด้านล่างแสดงตามปกติ</span>
            <button
              type="button"
              onClick={() => void fetchData()}
              className="ml-2 font-medium text-primary-deep hover:underline"
            >
              ลองใหม่
            </button>
          </div>
        )}

        <Card>
          <div className="space-y-2">
            <div>
              <span className="text-label text-ink-300">ชื่อบริษัท</span>
              <p className="text-body text-ink-900 font-medium">{clientProfile.company_name_th || "-"}</p>
            </div>
            {clientProfile.company_name_en && (
              <div>
                <span className="text-label text-ink-300">ชื่อบริษัท (EN)</span>
                <p className="text-body text-ink-900">{clientProfile.company_name_en}</p>
              </div>
            )}
            <div>
              <span className="text-label text-ink-300">อีเมล</span>
              <p className="text-body text-ink-900">{email || "-"}</p>
            </div>
            {clientProfile.tax_id && (
              <div>
                <span className="text-label text-ink-300">เลขผู้เสียภาษี</span>
                <p className="text-body text-ink-900">{clientProfile.tax_id}</p>
              </div>
            )}
            {clientProfile.address && (
              <div>
                <span className="text-label text-ink-300">ที่อยู่</span>
                <p className="text-body text-ink-900">{clientProfile.address}</p>
              </div>
            )}
            {clientProfile.phone && (
              <div>
                <span className="text-label text-ink-300">โทร</span>
                <p className="text-body text-ink-900">{clientProfile.phone}</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-4 pt-2 border-t border-card-border">
              <div>
                <span className="text-label text-ink-300">VAT</span>
                <p className="text-body text-ink-900">
                  {clientProfile.vat_registered ? "จดทะเบียน" : "ไม่ได้จด"}
                </p>
              </div>
              <div>
                <span className="text-label text-ink-300">หัก ณ ที่จ่าย เริ่มต้น</span>
                <p className="text-body text-ink-900">
                  {clientProfile.default_wht_rate === "0" ? "ไม่มี" : `${clientProfile.default_wht_rate}%`}
                </p>
              </div>
              <div>
                <span className="text-label text-ink-300">สถานะ</span>
                <p className="text-body">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-control text-label font-medium ${ accountError ? "bg-draft-bg text-ink-300" : isActive ? "bg-paid-bg text-paid-text" : "bg-draft-bg text-ink-300" }`}
                  >
                    {accountError ? "ไม่ทราบสถานะ" : isActive ? "ใช้งานอยู่" : "ปิดการใช้งาน"}
                  </span>
                </p>
              </div>
            </div>
            <div className="pt-1">
              <span className="text-label text-ink-300">สร้างบัญชีเมื่อ: {formatBuddhistDate(clientProfile.created_at)}</span>
              <span className="text-label text-ink-300 ml-4">เอกสารทั้งหมด: {documents.length >= 10 ? "10+" : documents.length}</span>
              <span className="text-label text-ink-300 ml-4">งานขาย: {dealCount}</span>
            </div>
          </div>
        </Card>

        <div className={CARD_LABEL}>Business Features</div>

        <Card>
          <div className="space-y-3">
            {CLIENT_FEATURES.map((feature) => {
              const enabled = enabledFeatureKeys.has(feature.key);
              return (
                <div key={feature.key} className="rounded-control border border-card-border bg-paper-tint p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-body font-medium text-ink-900">{feature.label}</div>
                      <p className="mt-1 text-label leading-5 text-ink-300">{feature.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleFeature(feature.key)}
                      disabled={togglingFeature === feature.key}
                      className={`shrink-0 rounded-full px-3 py-1 text-label font-medium transition-colors ${ enabled ? "bg-success-border text-success-text hover:bg-success-border" : "bg-line-faint text-ink-600 hover:bg-line" } disabled:cursor-not-allowed disabled:opacity-60`}
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
                <div className="text-body font-medium text-ink-900">Owner, manager, officer</div>
                <p className="mt-1 text-label leading-5 text-ink-300">
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

            <div className="divide-y divide-line rounded-control border border-card-border bg-white">
              {members.length === 0 ? (
                <div className="px-3 py-4 text-body text-ink-300">No team members yet.</div>
              ) : (
                members.map((member) => {
                  const isOwner = member.memberUserId === id || member.role === "owner";
                  return (
                    <div key={member.id} className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-body font-medium text-ink-900">{member.email || "-"}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-label text-ink-300">
                          <span>{member.customRoleName || roleLabels[member.role]}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-label font-medium ${ member.status === "active" ? "bg-paid-bg text-paid-text" : "bg-draft-bg text-ink-500" }`}
                          >
                            {member.status === "active" ? "Active" : "Disabled"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={member.customRoleId ?? `base:${member.role}`}
                          disabled={isOwner || memberActionId === member.id}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value.startsWith("base:")) {
                              handleUpdateMember(member, { role: value.slice(5) as "manager" | "officer", roleId: null });
                            } else {
                              handleUpdateMember(member, { roleId: value });
                            }
                          }}
                          className="rounded-control border border-card-border bg-white px-3 py-1.5 text-label text-ink-700 disabled:bg-paper-field disabled:text-ink-400"
                        >
                          <optgroup label="บทบาทพื้นฐาน">
                            <option value="base:manager">Manager</option>
                            <option value="base:officer">Officer</option>
                          </optgroup>
                          {customRoles.length > 0 && (
                            <optgroup label="บทบาทกำหนดเอง">
                              {customRoles.map((role) => (
                                <option key={role.id} value={role.id}>{role.name}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        {!isOwner && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setResetMemberTarget(member);
                                setResetMemberPasswordValue("");
                                setShowResetMemberPasswordModal(true);
                              }}
                            >
                              Reset PW
                            </Button>
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
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => {
                                setDeleteMemberTarget(member);
                                setShowDeleteMemberModal(true);
                              }}
                            >
                              Delete
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

        <div className={CARD_LABEL}>ประวัติการเปลี่ยนแปลงสิทธิ์</div>

        <Card>
          {auditEntries.length === 0 ? (
            <p className="text-body text-ink-300">ยังไม่มีประวัติการเปลี่ยนแปลง</p>
          ) : (
            <div className="divide-y divide-line-faint">
              {auditEntries.slice(0, 20).map((entry) => (
                <div key={entry.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-label">
                    <span className="font-semibold text-ink-900">{AUDIT_ACTION_LABELS[entry.action] || entry.action}</span>
                    <span className="text-ink-300">{entry.actor_email || "ระบบ"}</span>
                    {entry.target_email && entry.target_email !== entry.actor_email && (
                      <span className="text-ink-300">→ {entry.target_email}</span>
                    )}
                    <span className="ml-auto text-ink-100">
                      {new Date(entry.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className={CARD_LABEL}>ประวัติการล้างข้อมูล (Reset backups)</div>

        <Card>
          {resetBackups.length === 0 ? (
            <p className="text-body text-ink-300">ยังไม่มีประวัติการล้างข้อมูล</p>
          ) : (
            <div className="divide-y divide-line-faint">
              {resetBackups.map((backup) => (
                <div key={backup.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-label">
                      <span className="font-semibold text-ink-900">
                        {AUDIT_ACTION_LABELS[backup.action] || backup.action}
                      </span>
                      <span className="text-ink-100">
                        {new Date(backup.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                      {backup.id === lastResetBackupId && (
                        <span className="rounded-full bg-paid-bg px-2 py-0.5 text-label font-medium text-paid-text">ใหม่</span>
                      )}
                      {backup.downloaded_at && (
                        <span className="text-ink-300">ดาวน์โหลดแล้ว</span>
                      )}
                    </div>
                    <p className="mt-1 text-label leading-5 text-ink-500">
                      {backup.summary
                        ? `เอกสาร ${backup.summary.documents_deleted} · งานขาย ${backup.summary.deals_deleted} · คืนสต็อก ${backup.summary.items_stock_restored} รายการ`
                        : "ไม่มีข้อมูลสรุป"}
                      {backup.reason ? ` · เหตุผล: ${backup.reason}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    loading={downloadingBackupId === backup.id}
                    disabled={Boolean(downloadingBackupId) && downloadingBackupId !== backup.id}
                    onClick={() => handleDownloadBackup(backup.id)}
                  >
                    ดาวน์โหลด backup
                  </Button>
                </div>
              ))}
            </div>
          )}
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

            <Button variant="secondary" className="w-full text-danger border-danger/20 hover:bg-red-50" onClick={handleToggleActive} disabled={toggling}>
              {toggling ? "กำลังดำเนินการ..." : isActive ? "ปิดการใช้งานบัญชี" : "เปิดใช้งานบัญชี"}
            </Button>

            <div className="rounded-control border border-amber-200 bg-amber-50 p-3">
              <div className="text-label font-semibold text-amber-800">Dev Mode</div>
              <p className="mt-1 text-body leading-6 text-amber-900">
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

            <div className="rounded-control border border-amber-200 bg-amber-50 p-3">
              <div className="text-label font-semibold text-amber-800">Start New Workspace</div>
              <p className="mt-1 text-body leading-6 text-amber-900">
                Archive active deals, customers, and catalog items for this client, then reset document numbering.
                Old documents remain available as history, and deal numbers (DL-) continue after the highest archived number.
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-label text-amber-900/80">
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

            <div className="rounded-control border border-orange-200 bg-orange-50 p-3">
              <div className="text-label font-semibold text-orange-800">Clear Documents &amp; Numbering</div>
              <p className="mt-1 text-body leading-6 text-orange-900">
                End-of-trial cleanup: delete all documents, deals, stock movements, and WHT records for this client.
                Document numbering restarts at 1 and deal numbering (DL-) restarts at 00001.
                Item stock counts are restored to their pre-trial levels. Customers, catalog items, and
                profile settings are preserved. A full JSON backup is saved before deleting and can be
                downloaded from below.
              </p>
              <Button
                variant="danger"
                className="mt-3 w-full justify-center"
                onClick={openResetDocsModal}
              >
                Clear all documents and numbering
              </Button>
            </div>

            <div className="rounded-control border border-orange-200 bg-orange-50 p-3">
              <div className="text-label font-semibold text-orange-800">Reset All Data</div>
              <p className="mt-1 text-body leading-6 text-orange-900">
                Permanently delete all documents, deals, customers, catalog items, stock history, and WHT records.
                Number sequences (documents and deals) will be reset. The client account and profile settings are preserved.
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

            <div className="rounded-control border border-red-200 bg-red-50 p-3">
              <div className="text-label font-semibold text-red-800">Delete Client</div>
              <p className="mt-1 text-body leading-6 text-red-900">
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
                      <td className="py-2 pr-2 font-medium text-ink-900">{document.doc_number || "-"}</td>
                      <td className="py-2 pr-2 text-ink-500">{DOC_TYPE_LABELS[document.doc_type]?.th || document.doc_type}</td>
                      <td className="py-2 pr-2 text-ink-400">{(document as any).customer?.name || "-"}</td>
                      <td className="py-2 pr-2 text-right">฿ {document.total_amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                      <td className="py-2">
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded text-label font-medium ${ STATUS_COLORS[document.status]?.bg || "bg-draft-bg" } ${STATUS_COLORS[document.status]?.text || "text-ink-700"}`}
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
          <div className="rounded-control border border-card-border bg-paper-tint p-3 text-label leading-5 text-ink-500">
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
            <div className="rounded-control border border-card-border bg-paper-tint p-3">
              <div className="text-body font-medium text-ink-900">{permissionMember.email}</div>
              <p className="mt-1 text-label leading-5 text-ink-300">
                Role: {permissionMember.customRoleName || roleLabels[permissionMember.role]}. These toggles override the default access for this staff member only.
              </p>
            </div>

            {PERMISSION_SECTIONS.map((section) => (
              <div key={section.title}>
                <div className="mb-2 text-label font-semibold text-ink-300">
                  {section.title}
                </div>
                <div className="space-y-2">
                  {section.keys.map((permissionKey) => {
                    const checked = Boolean(permissionDraft[permissionKey]);
                    const meta = PERMISSION_META.get(permissionKey);
                    return (
                      <label
                        key={permissionKey}
                        className="flex cursor-pointer items-start justify-between gap-3 rounded-control border border-card-border bg-white p-3 hover:bg-paper-tint"
                      >
                        <span className="min-w-0">
                          <span className="block text-body font-medium text-ink-900">{meta?.label ?? permissionKey}</span>
                          <span className="mt-1 block text-label leading-5 text-ink-300">{meta?.description ?? ""}</span>
                        </span>
                        <span
                          className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${ checked ? "bg-primary" : "bg-ink-100" }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => setPermissionValue(permissionKey, event.target.checked)}
                            className="sr-only"
                          />
                          <span
                            className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${ checked ? "translate-x-5" : "translate-x-0.5" }`}
                          />
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button
                variant="ghost"
                onClick={() => setPermissionDraft(getWorkspacePermissions(permissionMember.role))}
                disabled={savingPermissions}
              >
                ล้างสิทธิ์ทั้งหมด
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
          <p className="text-body leading-6 text-ink-700">
            This will hide the client&apos;s active workspace from normal day-to-day screens by archiving active deals, customers, and items.
            It will also reset document numbering. Existing documents remain in the database as history, and deal numbers
            (DL-) continue after the highest archived number.
          </p>
          <div className="rounded-control border border-line bg-paper-field p-3 text-body text-ink-700">
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
            setResetDocsReason("");
            setResetDocsPreview(null);
          }
        }}
        title="Clear documents and numbering"
      >
        <div className="space-y-4">
          <p className="text-body leading-6 text-ink-700">
            This will permanently delete all documents, deals, stock movements, and WHT records for this client.
            Document numbering will restart from 1 and deal numbering (DL-) from 00001. Item stock counts will be
            restored to their pre-trial levels (document-driven movements are reversed; manual stock-ins stay counted).
          </p>

          <div className="rounded-control border border-line bg-paper-field p-3">
            <div className="text-body font-medium text-ink-900">What will be deleted</div>
            {loadingResetPreview ? (
              <div className="mt-2 flex items-center gap-2 text-body text-ink-300">
                <Spinner inline className="w-4 h-4 border-line-strong" />
                Loading preview…
              </div>
            ) : resetDocsPreview ? (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-label text-ink-700">
                  <div>Documents: {resetDocsPreview.documents}</div>
                  <div>Document line items: {resetDocsPreview.document_line_items}</div>
                  <div>Deals: {resetDocsPreview.deals}</div>
                  <div>Stock movements: {resetDocsPreview.stock_movements}</div>
                  <div>WHT records: {resetDocsPreview.wht_records}</div>
                  <div>Attachments: {resetDocsPreview.files}</div>
                </div>
                {resetDocsPreview.items.length > 0 && (
                  <div>
                    <div className="text-label text-ink-500">Stock to be restored:</div>
                    <ul className="list-disc pl-5 text-label text-ink-700">
                      {resetDocsPreview.items.map((item) => (
                        <li key={item.id}>
                          {item.name}: {item.stock_before} → {item.stock_after}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-2 text-label text-ink-300">Preview unavailable.</p>
            )}
          </div>

          <p className="text-body leading-6 text-ink-700 font-medium">
            The following will be preserved:
          </p>
          <ul className="text-body text-ink-600 list-disc pl-5 space-y-1">
            <li>Customers ({activeCustomerCount} active)</li>
            <li>Catalog items ({activeItemCount} active)</li>
            <li>WHT vendors (master data)</li>
            <li>Profile settings (company name, tax ID, logo, etc.)</li>
          </ul>
          <p className="text-body leading-6 text-ink-700">
            A full JSON backup of everything deleted is saved automatically. You can download it below or later
            from the reset history. The live data itself cannot be restored from the UI.
          </p>
          <Input
            id="reset-docs-reason"
            label="Reason for this reset"
            value={resetDocsReason}
            onChange={(event) => setResetDocsReason(event.target.value)}
            placeholder="e.g. Trial period ended"
            maxLength={200}
          />
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
                setResetDocsReason("");
                setResetDocsPreview(null);
              }}
              disabled={resettingDocs}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleResetDocuments}
              loading={resettingDocs}
              disabled={resetDocsConfirm.trim() !== confirmName || resetDocsReason.trim().length < 3}
            >
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
          <p className="text-body leading-6 text-ink-700">
            This will permanently delete all documents, deals, customers, catalog items,
            stock history, and WHT records for this client. Number sequences for documents
            and deals will be reset to defaults. The client account and profile settings
            (company name, tax ID, logo, PDF template, etc.) will be preserved. This action cannot be undone.
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
          <p className="text-body leading-6 text-ink-700">
            This will <strong className="text-red-600">permanently delete</strong> the client{" "}
            <strong>{clientProfile.company_name_th || email}</strong>, including:
          </p>
          <ul className="text-body text-ink-600 list-disc pl-5 space-y-1">
            <li>All documents ({dealCount} deals, {documents.length} recent docs)</li>
            <li>All customers ({activeCustomerCount} active)</li>
            <li>All catalog items ({activeItemCount} active)</li>
            <li>Company profile, settings, and numbering</li>
            <li>Login account ({email})</li>
          </ul>
          <p className="text-body font-semibold text-red-600">This action is irreversible. The data cannot be recovered.</p>
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
          <p className="text-body leading-6 text-ink-700">
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

      <Modal open={showResetMemberPasswordModal} onClose={() => setShowResetMemberPasswordModal(false)} title="รีเซ็ตรหัสผ่านสมาชิก">
        <div className="space-y-4">
          <p className="text-body text-ink-600">
            ตั้งรหัสผ่านชั่วคราวให้ <strong>{resetMemberTarget?.email || ""}</strong> สมาชิกจะถูกขอให้เปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งถัดไป
          </p>
          <Input
            id="reset-member-password"
            label="รหัสผ่านชั่วคราว"
            type="password"
            value={resetMemberPasswordValue}
            onChange={(e) => setResetMemberPasswordValue(e.target.value)}
            minLength={6}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowResetMemberPasswordModal(false)}>ยกเลิก</Button>
            <Button
              onClick={handleResetMemberPassword}
              loading={resettingMemberPassword}
              disabled={!resetMemberPasswordValue || resetMemberPasswordValue.length < 6}
            >
              รีเซ็ตรหัสผ่าน
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showDeleteMemberModal} onClose={() => setShowDeleteMemberModal(false)} title="ลบสมาชิก">
        <div className="space-y-4">
          <p className="text-body text-ink-600">
            คุณแน่ใจว่าต้องการลบ <strong>{deleteMemberTarget?.email || ""}</strong> ออกจากทีมใช่หรือไม่? การลบจะยกเลิกบัญชีผู้ใช้ทั้งหมดและไม่สามารถเรียกคืนได้
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowDeleteMemberModal(false)}>ยกเลิก</Button>
            <Button variant="danger" onClick={handleDeleteMember} loading={deletingMember}>
              ลบสมาชิก
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
