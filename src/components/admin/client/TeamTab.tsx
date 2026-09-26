import { useState } from "react";
import {
  createAdminClientMember,
  deleteAdminClientMember,
  resetMemberPassword,
  updateAdminClientMember,
  type AdminAuditEntry,
  type AdminClientMember,
} from "../../../lib/adminApi";
import {
  PERMISSION_GROUPS,
  PERMISSION_SECTIONS,
  getWorkspacePermissions,
  type WorkspaceCustomRole,
  type WorkspacePermissions,
} from "../../../lib/permissions";
import { useToast } from "../../../hooks/useToast";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Input, Select } from "../../ui/Input";
import { Modal } from "../../ui/Modal";
import { AUDIT_ACTION_LABELS, SectionHeader } from "./shared";

const PERMISSION_META = new Map(PERMISSION_GROUPS.map((group) => [group.key, group]));

interface TeamTabProps {
  clientId: string | undefined;
  members: AdminClientMember[];
  setMembers: React.Dispatch<React.SetStateAction<AdminClientMember[]>>;
  customRoles: WorkspaceCustomRole[];
  auditEntries: AdminAuditEntry[];
}

export function TeamTab({
  clientId: id,
  members,
  setMembers,
  customRoles,
  auditEntries,
}: TeamTabProps) {
  const toast = useToast();
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"manager" | "officer">("manager");
  const [memberPassword, setMemberPassword] = useState("");
  const [creatingMember, setCreatingMember] = useState(false);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [permissionMember, setPermissionMember] = useState<AdminClientMember | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<WorkspacePermissions | null>(null);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [showResetMemberPasswordModal, setShowResetMemberPasswordModal] = useState(false);
  const [resetMemberTarget, setResetMemberTarget] = useState<AdminClientMember | null>(null);
  const [resetMemberPasswordValue, setResetMemberPasswordValue] = useState("");
  const [resettingMemberPassword, setResettingMemberPassword] = useState(false);
  const [showDeleteMemberModal, setShowDeleteMemberModal] = useState(false);
  const [deleteMemberTarget, setDeleteMemberTarget] = useState<AdminClientMember | null>(null);
  const [deletingMember, setDeletingMember] = useState(false);

  const roleLabels: Record<AdminClientMember["role"], string> = {
    owner: "Owner",
    manager: "Manager",
    officer: "Officer",
  };

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

  async function handleUpdateMember(
    member: AdminClientMember,
    patch: {
      role?: "manager" | "officer";
      status?: "active" | "disabled";
      permissions?: Partial<WorkspacePermissions> | null;
      roleId?: string | null;
    },
  ) {
    if (!id) return;
    setMemberActionId(member.id);
    try {
      await updateAdminClientMember(id, member.id, patch);
      setMembers((prev) =>
        prev.map((item) => {
          if (item.id !== member.id) return item;
          const next = { ...item, ...patch };
          if (patch.roleId !== undefined) {
            next.customRoleId = patch.roleId;
            next.customRoleName = patch.roleId
              ? (customRoles.find((role) => role.id === patch.roleId)?.name ?? null)
              : null;
          }
          if (patch.status) {
            next.isActive = patch.status === "active";
          }
          return next;
        }),
      );
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
      toast.success(
        "ตั้งรหัสผ่านใหม่ให้ " + (resetMemberTarget.email || "staff") + " เรียบร้อยแล้ว",
      );
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
    setPermissionDraft(
      getWorkspacePermissions(
        member.role,
        member.permissions as Partial<WorkspacePermissions> | null,
      ),
    );
  }

  function setPermissionValue(key: keyof WorkspacePermissions, value: boolean) {
    setPermissionDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSavePermissions() {
    if (!id || !permissionMember || !permissionDraft) return;
    setSavingPermissions(true);
    try {
      await updateAdminClientMember(id, permissionMember.id, { permissions: permissionDraft });
      setMembers((prev) =>
        prev.map((member) =>
          member.id === permissionMember.id ? { ...member, permissions: permissionDraft } : member,
        ),
      );
      setPermissionMember(null);
      setPermissionDraft(null);
      toast.success("อัปเดตสิทธิ์แล้ว");
    } catch (error: any) {
      toast.error(error.message || "Unable to update permissions");
    } finally {
      setSavingPermissions(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <SectionHeader>Team Members</SectionHeader>
        <Card>
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-body font-medium text-ink-900">Owner, manager, officer</div>
                <p className="mt-1 text-label leading-5 text-ink-300">
                  Admin-managed staff access for this client workspace. Owner keeps settings
                  control; managers operate documents; officers prepare drafts.
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
                    <div
                      key={member.id}
                      className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-body font-medium text-ink-900">
                          {member.email || "-"}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-label text-ink-300">
                          <span>{member.customRoleName || roleLabels[member.role]}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-label font-medium ${member.status === "active" ? "bg-paid-bg text-paid-text" : "bg-draft-bg text-ink-500"}`}
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
                              handleUpdateMember(member, {
                                role: value.slice(5) as "manager" | "officer",
                                roleId: null,
                              });
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
                                <option key={role.id} value={role.id}>
                                  {role.name}
                                </option>
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
                              onClick={() =>
                                handleUpdateMember(member, {
                                  status: member.status === "active" ? "disabled" : "active",
                                })
                              }
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
      </div>

      <div>
        <SectionHeader>ประวัติการเปลี่ยนแปลงสิทธิ์</SectionHeader>
        <Card>
          {auditEntries.length === 0 ? (
            <p className="text-body text-ink-300">ยังไม่มีประวัติการเปลี่ยนแปลง</p>
          ) : (
            <div className="divide-y divide-line-faint">
              {auditEntries.slice(0, 20).map((entry) => (
                <div key={entry.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-label">
                    <span className="font-semibold text-ink-900">
                      {AUDIT_ACTION_LABELS[entry.action] || entry.action}
                    </span>
                    <span className="text-ink-300">{entry.actor_email || "ระบบ"}</span>
                    {entry.target_email && entry.target_email !== entry.actor_email && (
                      <span className="text-ink-300">→ {entry.target_email}</span>
                    )}
                    <span className="ml-auto text-ink-100">
                      {new Date(entry.created_at).toLocaleString("th-TH", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                </div>
              ))}
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
            Staff users share this client's customers, catalog, documents, and numbering. They do
            not get their own company profile.
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowAddMemberModal(false)}
              disabled={creatingMember}
            >
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
                Role: {permissionMember.customRoleName || roleLabels[permissionMember.role]}. These
                toggles override the default access for this staff member only.
              </p>
            </div>

            {PERMISSION_SECTIONS.map((section) => (
              <div key={section.title}>
                <div className="mb-2 text-label font-semibold text-ink-300">{section.title}</div>
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
                          <span className="block text-body font-medium text-ink-900">
                            {meta?.label ?? permissionKey}
                          </span>
                          <span className="mt-1 block text-label leading-5 text-ink-300">
                            {meta?.description ?? ""}
                          </span>
                        </span>
                        <span
                          className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-primary" : "bg-ink-100"}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              setPermissionValue(permissionKey, event.target.checked)
                            }
                            className="sr-only"
                          />
                          <span
                            className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`}
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
        open={showResetMemberPasswordModal}
        onClose={() => setShowResetMemberPasswordModal(false)}
        title="รีเซ็ตรหัสผ่านสมาชิก"
      >
        <div className="space-y-4">
          <p className="text-body text-ink-600">
            ตั้งรหัสผ่านชั่วคราวให้ <strong>{resetMemberTarget?.email || ""}</strong>{" "}
            สมาชิกจะถูกขอให้เปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งถัดไป
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
            <Button variant="secondary" onClick={() => setShowResetMemberPasswordModal(false)}>
              ยกเลิก
            </Button>
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

      <Modal
        open={showDeleteMemberModal}
        onClose={() => setShowDeleteMemberModal(false)}
        title="ลบสมาชิก"
      >
        <div className="space-y-4">
          <p className="text-body text-ink-600">
            คุณแน่ใจว่าต้องการลบ <strong>{deleteMemberTarget?.email || ""}</strong>{" "}
            ออกจากทีมใช่หรือไม่? การลบจะยกเลิกบัญชีผู้ใช้ทั้งหมดและไม่สามารถเรียกคืนได้
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowDeleteMemberModal(false)}>
              ยกเลิก
            </Button>
            <Button variant="danger" onClick={handleDeleteMember} loading={deletingMember}>
              ลบสมาชิก
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
