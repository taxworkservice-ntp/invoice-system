import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { useToast } from "../../../hooks/useToast";
import {
  deleteAdminClient,
  fetchAdminResetBackupBlob,
  previewClientDocumentReset,
  previewResetAll,
  previewResetWorkspace,
  resetAdminClientWorkspace,
  resetAllClientData,
  resetClientDocuments,
  restoreAdminBackup,
  updateAdminClientPassword,
  type AdminResetBackup,
  type ResetAllPreview,
  type ResetDocumentsPreview,
  type ResetWorkspacePreview,
  type RestoreDryRun,
} from "../../../lib/adminApi";
import { downloadBlob, sanitizeFilenamePart } from "../../../lib/download/download";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Input } from "../../ui/Input";
import { Modal } from "../../ui/Modal";
import { Spinner } from "../../ui/Spinner";
import type { ClientProfile, Document } from "../../../types";
import { AUDIT_ACTION_LABELS, SectionHeader } from "./shared";

interface ManageTabProps {
  clientId: string | undefined;
  email: string;
  clientProfile: ClientProfile | null;
  setClientProfile: React.Dispatch<React.SetStateAction<ClientProfile | null>>;
  documents: Document[];
  dealCount: number;
  activeCustomerCount: number;
  activeItemCount: number;
  activeDealCount: number;
  resetBackups: AdminResetBackup[];
  setResetBackups: React.Dispatch<React.SetStateAction<AdminResetBackup[]>>;
  fetchData: () => Promise<void>;
}

export function ManageTab({
  clientId: id,
  email,
  clientProfile,
  setClientProfile,
  documents,
  dealCount,
  activeCustomerCount,
  activeItemCount,
  activeDealCount,
  resetBackups,
  setResetBackups,
  fetchData,
}: ManageTabProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [resetting, setResetting] = useState(false);
  const [togglingDev, setTogglingDev] = useState(false);
  const [showWorkspaceResetModal, setShowWorkspaceResetModal] = useState(false);
  const [workspaceResetConfirm, setWorkspaceResetConfirm] = useState("");
  const [workspaceResetReason, setWorkspaceResetReason] = useState("");
  const [workspacePreview, setWorkspacePreview] = useState<ResetWorkspacePreview | null>(null);
  const [loadingWorkspacePreview, setLoadingWorkspacePreview] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showResetAllModal, setShowResetAllModal] = useState(false);
  const [resetAllConfirm, setResetAllConfirm] = useState("");
  const [resettingAll, setResettingAll] = useState(false);
  const [resetAllReason, setResetAllReason] = useState("");
  const [resetAllPreview, setResetAllPreview] = useState<ResetAllPreview | null>(null);
  const [loadingResetAllPreview, setLoadingResetAllPreview] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState<AdminResetBackup | null>(null);
  const [restoreDryRun, setRestoreDryRun] = useState<RestoreDryRun | null>(null);
  const [loadingRestoreDryRun, setLoadingRestoreDryRun] = useState(false);
  const [restoreAcknowledge, setRestoreAcknowledge] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showResetDocsModal, setShowResetDocsModal] = useState(false);
  const [resetDocsConfirm, setResetDocsConfirm] = useState("");
  const [resetDocsReason, setResetDocsReason] = useState("");
  const [resetDocsPreview, setResetDocsPreview] = useState<ResetDocumentsPreview | null>(null);
  const [loadingResetPreview, setLoadingResetPreview] = useState(false);
  const [downloadingBackupId, setDownloadingBackupId] = useState<string | null>(null);
  const [lastResetBackupId, setLastResetBackupId] = useState<string | null>(null);
  const [resettingDocs, setResettingDocs] = useState(false);

  const confirmName = clientProfile?.company_name_th?.trim() || email.trim();

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

  async function handleToggleDevMode() {
    if (!id) return;
    setTogglingDev(true);
    try {
      const newValue = !clientProfile?.dev_mode_enabled;
      await supabase.rpc("toggle_dev_mode", { p_user_id: id, p_enabled: newValue });
      setClientProfile((prev) => (prev ? { ...prev, dev_mode_enabled: newValue } : prev));
      toast.success(newValue ? "เปิด Dev Mode แล้ว" : "ปิด Dev Mode แล้ว");
    } catch (error: any) {
      toast.error(error.message || "Unable to toggle dev mode");
    } finally {
      setTogglingDev(false);
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

    const reason = workspaceResetReason.trim();
    if (reason.length < 3) {
      toast.error("กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร");
      return;
    }

    setResetting(true);
    try {
      const result = await resetAdminClientWorkspace(id, {
        reason,
        confirmName: workspaceResetConfirm.trim(),
      });
      const summary = result?.summary;
      const summaryText = summary
        ? ` (งานขาย ${summary.deals_archived} · ลูกค้า ${summary.customers_archived} · สินค้า ${summary.items_archived})`
        : "";
      setShowWorkspaceResetModal(false);
      setWorkspaceResetConfirm("");
      setWorkspaceResetReason("");
      setWorkspacePreview(null);
      toast.success("Archive workspace and reset numbering completed" + summaryText);
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || "Reset workspace failed");
    } finally {
      setResetting(false);
    }
  }

  async function openWorkspaceResetModal() {
    setWorkspaceResetConfirm("");
    setWorkspaceResetReason("");
    setWorkspacePreview(null);
    setShowWorkspaceResetModal(true);
    if (!id) return;

    setLoadingWorkspacePreview(true);
    try {
      const result = await previewResetWorkspace(id);
      setWorkspacePreview(result.preview);
    } catch (error: any) {
      toast.error(error.message || "Unable to load reset preview");
    } finally {
      setLoadingWorkspacePreview(false);
    }
  }

  async function handleResetAllData() {
    if (!id || !clientProfile) return;

    const expected = clientProfile.company_name_th?.trim() || email.trim();
    if (resetAllConfirm.trim() !== expected) {
      toast.error("ชื่อยืนยันไม่ตรงกัน");
      return;
    }

    const reason = resetAllReason.trim();
    if (reason.length < 3) {
      toast.error("กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร");
      return;
    }

    setResettingAll(true);
    try {
      const result = await resetAllClientData(id, {
        reason,
        confirmName: resetAllConfirm.trim(),
      });
      const summary = result?.summary;
      const summaryText = summary
        ? ` (เอกสาร ${summary.documents_deleted} · งานขาย ${summary.deals_deleted})`
        : "";
      setShowResetAllModal(false);
      setResetAllConfirm("");
      setResetAllReason("");
      setResetAllPreview(null);
      toast.success("ล้างข้อมูลทั้งหมดเรียบร้อยแล้ว" + summaryText + " · บันทึก backup แล้ว");
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || "Reset all data failed");
    } finally {
      setResettingAll(false);
    }
  }

  async function openResetAllModal() {
    setResetAllConfirm("");
    setResetAllReason("");
    setResetAllPreview(null);
    setShowResetAllModal(true);
    if (!id) return;

    setLoadingResetAllPreview(true);
    try {
      const result = await previewResetAll(id);
      setResetAllPreview(result.preview);
    } catch (error: any) {
      toast.error(error.message || "Unable to load reset preview");
    } finally {
      setLoadingResetAllPreview(false);
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
      const company = sanitizeFilenamePart(
        clientProfile?.company_name_th?.trim() || email || "client",
      );
      downloadBlob(blob, `reset-backup_${company}_${backupId.slice(0, 8)}.json`);
      setResetBackups((prev) =>
        prev.map((backup) =>
          backup.id === backupId ? { ...backup, downloaded_at: new Date().toISOString() } : backup,
        ),
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
      toast.success(
        "ล้างเอกสารและตั้งเลขใหม่เรียบร้อยแล้ว" + summaryText + " · บันทึก backup แล้ว",
      );
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

    const reason = deleteReason.trim();
    if (reason.length < 3) {
      toast.error("กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร");
      return;
    }

    setDeleting(true);
    try {
      await deleteAdminClient(id, { reason, confirmName: deleteConfirm.trim() });
      setShowDeleteModal(false);
      toast.success("ลบข้อมูลลูกค้าทั้งหมดเรียบร้อยแล้ว · บันทึก backup แล้ว");
      navigate("/admin/clients", { replace: true });
    } catch (error: any) {
      toast.error(error.message || "ไม่สามารถลบข้อมูลลูกค้าได้");
    } finally {
      setDeleting(false);
    }
  }

  async function openRestoreModal(backup: AdminResetBackup) {
    setRestoringBackup(backup);
    setRestoreDryRun(null);
    setRestoreAcknowledge(false);
    if (!id) return;

    setLoadingRestoreDryRun(true);
    try {
      const result = await restoreAdminBackup(id, { backupId: backup.id, dryRun: true });
      setRestoreDryRun(result.restore);
    } catch (error: any) {
      toast.error(error.message || "Unable to load restore preview");
    } finally {
      setLoadingRestoreDryRun(false);
    }
  }

  async function handleRestoreExecute() {
    if (!id || !restoringBackup || !restoreDryRun) return;
    if (restoreDryRun.newer_data_warning && !restoreAcknowledge) {
      toast.error("กรุณาติ๊กยืนยันการแทนที่ข้อมูลใหม่ก่อนกู้คืน");
      return;
    }

    setRestoring(true);
    try {
      await restoreAdminBackup(id, {
        backupId: restoringBackup.id,
        dryRun: false,
        acknowledgeDataLoss: restoreDryRun.newer_data_warning ? true : undefined,
      });
      setRestoringBackup(null);
      setRestoreDryRun(null);
      setRestoreAcknowledge(false);
      toast.success("กู้คืนข้อมูลจาก backup เรียบร้อยแล้ว");
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || "Restore failed");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <SectionHeader>บัญชีและการเข้าถึง</SectionHeader>
        <Card>
          <div className="space-y-2">
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleResetPassword}
              disabled={resetting || !email}
            >
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
                {togglingDev
                  ? "..."
                  : clientProfile?.dev_mode_enabled
                    ? "Disable Dev Mode"
                    : "Enable Dev Mode"}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div>
        <SectionHeader>โซนอันตราย</SectionHeader>
        <Card className="!border-danger/30">
          <div className="space-y-2">
            <div className="rounded-control border border-amber-200 bg-amber-50 p-3">
              <div className="text-label font-semibold text-amber-800">Start New Workspace</div>
              <p className="mt-1 text-body leading-6 text-amber-900">
                Archive active deals, customers, and catalog items for this client, then reset
                document numbering. Old documents remain available as history, and deal numbers
                (DL-) continue after the highest archived number.
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-label text-amber-900/80">
                <div>Active deals: {activeDealCount}</div>
                <div>Active customers: {activeCustomerCount}</div>
                <div>Active items: {activeItemCount}</div>
              </div>
              <Button
                variant="danger"
                className="mt-3 w-full justify-center"
                onClick={openWorkspaceResetModal}
              >
                Archive workspace and reset numbering
              </Button>
            </div>

            <div className="rounded-control border border-orange-200 bg-orange-50 p-3">
              <div className="text-label font-semibold text-orange-800">
                Clear Documents &amp; Numbering
              </div>
              <p className="mt-1 text-body leading-6 text-orange-900">
                End-of-trial cleanup: delete all documents, deals, stock movements, and WHT records
                for this client. Document numbering restarts at 1 and deal numbering (DL-) restarts
                at 00001. Item stock counts are restored to their pre-trial levels. Customers,
                catalog items, and profile settings are preserved. A full JSON backup is saved
                before deleting and can be downloaded from below.
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
                Permanently delete all documents, deals, customers, catalog items, stock history,
                and WHT records. Number sequences (documents and deals) will be reset. The client
                account and profile settings are preserved. This action cannot be undone.
              </p>
              <Button
                variant="danger"
                className="mt-3 w-full justify-center"
                onClick={openResetAllModal}
              >
                Reset all data to empty
              </Button>
            </div>

            <div className="rounded-control border border-red-200 bg-red-50 p-3">
              <div className="text-label font-semibold text-red-800">Delete Client</div>
              <p className="mt-1 text-body leading-6 text-red-900">
                Permanently delete this client, all their documents, customers, items, and account
                data. This action cannot be undone.
              </p>
              <Button
                variant="danger"
                className="mt-3 w-full justify-center"
                onClick={() => {
                  setDeleteConfirm("");
                  setDeleteReason("");
                  setShowDeleteModal(true);
                }}
              >
                Delete client permanently
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div>
        <SectionHeader>ประวัติการล้างข้อมูล (Reset backups)</SectionHeader>
        <Card>
          {resetBackups.length === 0 ? (
            <p className="text-body text-ink-300">ยังไม่มีประวัติการล้างข้อมูล</p>
          ) : (
            <div className="divide-y divide-line-faint">
              {resetBackups.map((backup) => (
                <div
                  key={backup.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-label">
                      <span className="font-semibold text-ink-900">
                        {AUDIT_ACTION_LABELS[backup.action] || backup.action}
                      </span>
                      <span className="text-ink-100">
                        {new Date(backup.created_at).toLocaleString("th-TH", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                      {backup.id === lastResetBackupId && (
                        <span className="rounded-full bg-paid-bg px-2 py-0.5 text-label font-medium text-paid-text">
                          ใหม่
                        </span>
                      )}
                      {backup.downloaded_at && <span className="text-ink-300">ดาวน์โหลดแล้ว</span>}
                    </div>
                    <p className="mt-1 text-label leading-5 text-ink-500">
                      {backup.summary
                        ? `เอกสาร ${backup.summary.documents_deleted} · งานขาย ${backup.summary.deals_deleted} · คืนสต็อก ${backup.summary.items_stock_restored} รายการ`
                        : "ไม่มีข้อมูลสรุป"}
                      {backup.reason ? ` · เหตุผล: ${backup.reason}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={downloadingBackupId === backup.id}
                      disabled={Boolean(downloadingBackupId) && downloadingBackupId !== backup.id}
                      onClick={() => handleDownloadBackup(backup.id)}
                    >
                      ดาวน์โหลด backup
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={Boolean(restoringBackup)}
                      onClick={() => openRestoreModal(backup)}
                    >
                      กู้คืน
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={showWorkspaceResetModal}
        onClose={() => {
          if (!resetting) {
            setShowWorkspaceResetModal(false);
            setWorkspaceResetConfirm("");
            setWorkspaceResetReason("");
            setWorkspacePreview(null);
          }
        }}
        title="Archive workspace and reset numbering"
      >
        <div className="space-y-4">
          <p className="text-body leading-6 text-ink-700">
            This will hide the client&apos;s active workspace from normal day-to-day screens by
            archiving active deals, customers, and items. It will also reset document numbering.
            Existing documents remain in the database as history, and deal numbers (DL-) continue
            after the highest archived number.
          </p>
          <div className="rounded-control border border-line bg-paper-field p-3">
            <div className="text-body font-medium text-ink-900">What will be archived</div>
            {loadingWorkspacePreview ? (
              <div className="mt-2 flex items-center gap-2 text-body text-ink-300">
                <Spinner inline className="w-4 h-4 border-line-strong" />
                Loading preview…
              </div>
            ) : workspacePreview ? (
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-label text-ink-700">
                <div>Active deals: {workspacePreview.active_deals}</div>
                <div>Active customers: {workspacePreview.active_customers}</div>
                <div>Active items: {workspacePreview.active_items}</div>
              </div>
            ) : (
              <p className="mt-2 text-label text-ink-300">Preview unavailable.</p>
            )}
          </div>
          <Input
            id="workspace-reset-reason"
            label="Reason for this reset"
            value={workspaceResetReason}
            onChange={(event) => setWorkspaceResetReason(event.target.value)}
            placeholder="e.g. New fiscal year"
            maxLength={200}
          />
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
                setWorkspaceResetReason("");
                setWorkspacePreview(null);
              }}
              disabled={resetting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleArchiveAndResetWorkspace}
              loading={resetting}
              disabled={
                workspaceResetConfirm.trim() !== confirmName ||
                workspaceResetReason.trim().length < 3
              }
            >
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
            This will permanently delete all documents, deals, stock movements, and WHT records for
            this client. Document numbering will restart from 1 and deal numbering (DL-) from 00001.
            Item stock counts will be restored to their pre-trial levels (document-driven movements
            are reversed; manual stock-ins stay counted).
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
            A full JSON backup of everything deleted is saved automatically. You can download or
            restore it below or later from the reset history.
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
              disabled={
                resetDocsConfirm.trim() !== confirmName || resetDocsReason.trim().length < 3
              }
            >
              Clear all documents
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!restoringBackup}
        onClose={() => {
          if (!restoring && !loadingRestoreDryRun) {
            setRestoringBackup(null);
            setRestoreDryRun(null);
            setRestoreAcknowledge(false);
          }
        }}
        title="กู้คืนข้อมูลจาก backup"
      >
        <div className="space-y-4">
          <p className="text-body leading-6 text-ink-700">
            Restore replaces the current data in the tables captured by this backup (
            {restoringBackup
              ? AUDIT_ACTION_LABELS[restoringBackup.action] || restoringBackup.action
              : ""}
            {restoringBackup?.reason ? ` · เหตุผลเดิม: ${restoringBackup.reason}` : ""}). Account
            rows are never restored. Attachment files come back as metadata only — the file bytes
            are not recoverable.
          </p>
          {loadingRestoreDryRun ? (
            <div className="flex items-center gap-2 text-body text-ink-300">
              <Spinner inline className="w-4 h-4 border-line-strong" />
              กำลังตรวจสอบ…
            </div>
          ) : restoreDryRun ? (
            <>
              <div className="rounded-control border border-line bg-paper-field p-3">
                <div className="text-body font-medium text-ink-900">Backup vs ปัจจุบัน</div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-label text-ink-700">
                  {restoreDryRun.tables.map((row) => (
                    <div key={row.table}>
                      {row.table}: {row.payload} ← {row.current}
                    </div>
                  ))}
                </div>
              </div>
              {restoreDryRun.newer_data_warning && (
                <div className="rounded-control border border-red-200 bg-red-50 p-3 text-body leading-6 text-red-800">
                  มีข้อมูลใหม่กว่าจะถูกแทนที่ (
                  {restoreDryRun.tables.filter((row) => row.current > 0).length} ตาราง).
                  ติ๊กยืนยันด้านล่างเพื่อดำเนินการต่อ
                </div>
              )}
              {restoreDryRun.files_without_bytes > 0 && (
                <p className="text-label leading-5 text-ink-500">
                  ไฟล์แนบ {restoreDryRun.files_without_bytes} รายการจะกลับมาเฉพาะข้อมูล —
                  ตัวไฟล์กู้คืนไม่ได้
                </p>
              )}
              {restoreDryRun.newer_data_warning && (
                <label className="flex items-start gap-2 text-body text-ink-700">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={restoreAcknowledge}
                    onChange={(event) => setRestoreAcknowledge(event.target.checked)}
                  />
                  ยอมรับการแทนที่ข้อมูลใหม่กว่า
                </label>
              )}
            </>
          ) : (
            <p className="text-label text-ink-300">โหลดข้อมูลตรวจสอบไม่สำเร็จ</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setRestoringBackup(null);
                setRestoreDryRun(null);
                setRestoreAcknowledge(false);
              }}
              disabled={restoring || loadingRestoreDryRun}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleRestoreExecute}
              loading={restoring}
              disabled={
                !restoreDryRun ||
                loadingRestoreDryRun ||
                (restoreDryRun.newer_data_warning && !restoreAcknowledge)
              }
            >
              กู้คืนข้อมูล
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
            setResetAllReason("");
            setResetAllPreview(null);
          }
        }}
        title="Reset all client data"
      >
        <div className="space-y-4">
          <p className="text-body leading-6 text-ink-700">
            This will permanently delete all documents, deals, customers, catalog items, stock
            history, and WHT records for this client. Number sequences for documents and deals will
            be reset to defaults. The client account and profile settings (company name, tax ID,
            logo, PDF template, etc.) will be preserved.
          </p>
          <div className="rounded-control border border-line bg-paper-field p-3">
            <div className="text-body font-medium text-ink-900">What will be deleted</div>
            {loadingResetAllPreview ? (
              <div className="mt-2 flex items-center gap-2 text-body text-ink-300">
                <Spinner inline className="w-4 h-4 border-line-strong" />
                Loading preview…
              </div>
            ) : resetAllPreview ? (
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-label text-ink-700">
                <div>Documents: {resetAllPreview.documents}</div>
                <div>Document line items: {resetAllPreview.document_line_items}</div>
                <div>Deals: {resetAllPreview.deals}</div>
                <div>Stock movements: {resetAllPreview.stock_movements}</div>
                <div>WHT records: {resetAllPreview.wht_records}</div>
                <div>Attachments: {resetAllPreview.files}</div>
                <div>Customers: {resetAllPreview.customers}</div>
                <div>Catalog items: {resetAllPreview.items}</div>
              </div>
            ) : (
              <p className="mt-2 text-label text-ink-300">Preview unavailable.</p>
            )}
          </div>
          <p className="text-body leading-6 text-ink-700">
            A full JSON backup is saved automatically before deleting — you can download or restore
            it from the reset history below.
          </p>
          <Input
            id="reset-all-reason"
            label="Reason for this reset"
            value={resetAllReason}
            onChange={(event) => setResetAllReason(event.target.value)}
            placeholder="e.g. Fresh start requested"
            maxLength={200}
          />
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
                setResetAllReason("");
                setResetAllPreview(null);
              }}
              disabled={resettingAll}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleResetAllData}
              loading={resettingAll}
              disabled={resetAllConfirm.trim() !== confirmName || resetAllReason.trim().length < 3}
            >
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
            setDeleteReason("");
          }
        }}
        title="Delete client permanently"
      >
        <div className="space-y-4">
          <p className="text-body leading-6 text-ink-700">
            This will <strong className="text-red-600">permanently delete</strong> the client{" "}
            <strong>{clientProfile?.company_name_th || email}</strong>, including:
          </p>
          <ul className="text-body text-ink-600 list-disc pl-5 space-y-1">
            <li>
              All documents ({dealCount} deals, {documents.length} recent docs)
            </li>
            <li>All customers ({activeCustomerCount} active)</li>
            <li>All catalog items ({activeItemCount} active)</li>
            <li>Company profile, settings, and numbering</li>
            <li>Login account ({email})</li>
          </ul>
          <p className="text-body font-semibold text-red-600">
            The login account is deleted permanently. A backup of the workspace tables is saved
            first and stays available in the reset history below.
          </p>
          <Input
            id="delete-reason"
            label="Reason for deletion"
            value={deleteReason}
            onChange={(event) => setDeleteReason(event.target.value)}
            placeholder="e.g. Duplicate account"
            maxLength={200}
          />
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
                setDeleteReason("");
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteClient}
              loading={deleting}
              disabled={deleteConfirm.trim() !== confirmName || deleteReason.trim().length < 3}
            >
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
            กำหนดรหัสผ่านใหม่ให้กับ <strong>{clientProfile?.company_name_th || email}</strong>
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
            <Button
              onClick={handleChangePassword}
              loading={changingPassword}
              disabled={!newPassword || !newPasswordConfirm}
            >
              เปลี่ยนรหัสผ่าน
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
