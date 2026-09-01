import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { SectionCard } from "../../../components/ui/SectionCard";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Spinner } from "../../../components/ui/Spinner";
import { SettingsTabs } from "./_components/SettingsTabs";
import { useToast } from "../../../hooks/useToast";
import { apiFetch } from "../../../lib/api";
import {
  EDITABLE_PERMISSION_KEYS,
  PERMISSION_GROUPS,
  PERMISSION_SECTIONS,
  getWorkspacePermissions,
  type WorkspacePermissionKey,
  type WorkspacePermissions,
} from "../../../lib/permissions";
import type { ClientMemberRole, ClientMemberStatus } from "../../../types";

interface TeamMember {
  id: string;
  workspace_user_id: string;
  member_user_id: string;
  email: string;
  role: ClientMemberRole;
  status: ClientMemberStatus;
  permissions: Partial<WorkspacePermissions> | null;
  custom_role_id: string | null;
}

interface WorkspaceRole {
  id: string;
  name: string;
  permissions: Partial<WorkspacePermissions> | null;
  member_count: number;
}

interface AuditEntry {
  id: string;
  actor_email: string;
  target_email: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

type EditableDraft = Record<WorkspacePermissionKey, boolean>;

function emptyDraft(): EditableDraft {
  const draft = {} as EditableDraft;
  for (const key of EDITABLE_PERMISSION_KEYS) draft[key] = false;
  return draft;
}

const ROLE_TEMPLATES: { key: string; label: string; permissions: Partial<EditableDraft> }[] = [
  { key: "blank", label: "เริ่มจากว่าง", permissions: {} },
  {
    key: "manager",
    label: "แม่ทีมขาย (ตัวอย่าง)",
    permissions: {
      canViewCustomers: true,
      canManageCustomers: true,
      canViewCatalog: true,
      canManageCatalog: true,
      canCreateEditDocuments: true,
      canSendQuotations: true,
      canSendDeliveryNotes: true,
      canSendFinancialDocuments: true,
      canRecordPayments: true,
      canManageWht: true,
      canVoidDocuments: true,
      canViewReports: true,
      canExportReports: true,
    },
  },
  {
    key: "officer",
    label: "พนักงานประจำ (ตัวอย่าง)",
    permissions: {
      canViewCustomers: true,
      canManageCustomers: true,
      canViewCatalog: true,
      canCreateEditDocuments: true,
    },
  },
];

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "role.change": "เปลี่ยนบทบาท",
  "permissions.update": "ปรับสิทธิ์การเข้าถึง",
  "status.update": "เปลี่ยนสถานะสมาชิก",
  "member.added": "เพิ่มสมาชิกใหม่",
  "member.removed": "ลบสมาชิก",
  "custom_role.created": "สร้างบทบาทกำหนดเอง",
  "custom_role.updated": "แก้ไขบทบาทกำหนดเอง",
  "custom_role.deleted": "ลบบทบาทกำหนดเอง",
};

const PERMISSION_LABELS = new Map(PERMISSION_GROUPS.map((group) => [group.key, group.label]));

function summarizeAuditChange(entry: AuditEntry): string {
  const before = (entry.before || {}) as Record<string, unknown>;
  const after = (entry.after || {}) as Record<string, unknown>;

  if (entry.action === "permissions.update" || entry.action === "custom_role.updated") {
    const beforePermissions = (before.permissions || before) as Record<string, unknown>;
    const afterPermissions = (after.permissions || after) as Record<string, unknown>;
    const changed: string[] = [];
    for (const key of EDITABLE_PERMISSION_KEYS) {
      if (Boolean(beforePermissions[key]) !== Boolean(afterPermissions[key])) {
        changed.push(`${PERMISSION_LABELS.get(key) || key}: ${beforePermissions[key] ? "เปิด" : "ปิด"} → ${afterPermissions[key] ? "เปิด" : "ปิด"}`);
      }
    }
    return changed.length > 0 ? changed.join(" · ") : "ไม่มีการเปลี่ยนแปลงสิทธิ์";
  }

  if (entry.action === "role.change") {
    const parts: string[] = [];
    if (before.role !== after.role) parts.push(`บทบาท: ${before.role ?? "-"} → ${after.role ?? "-"}`);
    if (before.custom_role_id !== after.custom_role_id) parts.push("เปลี่ยนบทบาทกำหนดเอง");
    return parts.join(" · ") || "เปลี่ยนบทบาท";
  }

  if (entry.action === "status.update") {
    return `สถานะ: ${before.status ?? "-"} → ${after.status ?? "-"}`;
  }

  if (entry.action === "member.added") {
    return `บทบาทเริ่มต้น: ${after.role ?? "-"}`;
  }

  if (entry.action === "custom_role.created" || entry.action === "custom_role.deleted") {
    return String(after.name || before.name || "");
  }

  return "";
}

function PermissionToggle({
  permissionKey,
  checked,
  disabled,
  onChange,
}: {
  permissionKey: WorkspacePermissionKey;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const meta = PERMISSION_GROUPS.find((group) => group.key === permissionKey);
  if (!meta) return null;
  return (
    <label className={`flex items-start justify-between gap-3 rounded-lg border border-[#E8E6DF] p-3 ${disabled ? "opacity-60" : "cursor-pointer hover:bg-[#FBFAF7]"}`}>
      <span>
        <span className="block text-sm font-medium text-[#1A1A18]">{meta.label}</span>
        <span className="mt-1 block text-xs leading-5 text-gray-500">{meta.description}</span>
      </span>
      <span className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full ${checked ? "bg-primary" : "bg-gray-300"}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="sr-only"
        />
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </span>
    </label>
  );
}

function PermissionSections({
  draft,
  onToggle,
}: {
  draft: EditableDraft;
  onToggle: (key: WorkspacePermissionKey, checked: boolean) => void;
}) {
  return (
    <div className="space-y-5">
      {PERMISSION_SECTIONS.map((section) => (
        <div key={section.title}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
            {section.title}
          </div>
          <div className="space-y-2">
            {section.keys.map((key) => (
              <PermissionToggle
                key={key}
                permissionKey={key}
                checked={draft[key]}
                onChange={(checked) => onToggle(key, checked)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SettingsTeamPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"members" | "roles" | "audit">("members");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<WorkspaceRole[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberDraft, setMemberDraft] = useState<EditableDraft | null>(null);

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleNameDraft, setRoleNameDraft] = useState("");
  const [rolePermissionDraft, setRolePermissionDraft] = useState<EditableDraft>(emptyDraft());
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<WorkspaceRole | null>(null);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [memberResult, roleResult] = await Promise.all([
        apiFetch<{ members: TeamMember[] }>("/api/client/members"),
        apiFetch<{ roles: WorkspaceRole[] }>("/api/client/roles"),
      ]);
      setMembers(memberResult.members);
      setRoles(roleResult.roles);
      setSelectedMemberId((current) => current ?? memberResult.members[0]?.id ?? null);
      setMemberDraft((current) => current ?? draftFor(memberResult.members[0] ?? null, roleResult.roles));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "โหลดข้อมูลทีมไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function loadAudit() {
    try {
      const result = await apiFetch<{ entries: AuditEntry[] }>("/api/client/audit");
      setAudit(result.entries);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "โหลดประวัติไม่สำเร็จ");
    }
  }

  function draftFor(member: TeamMember | null, roleList: WorkspaceRole[]): EditableDraft {
    const draft = emptyDraft();
    if (!member) return draft;
    const overrides = member.permissions ?? (member.custom_role_id ? roleList.find((role) => role.id === member.custom_role_id)?.permissions : null) ?? null;
    const effective = getWorkspacePermissions(member.role, overrides);
    for (const key of EDITABLE_PERMISSION_KEYS) draft[key] = Boolean(effective[key]);
    return draft;
  }

  function selectMember(member: TeamMember) {
    setSelectedMemberId(member.id);
    setMemberDraft(draftFor(member, roles));
  }

  async function saveMemberPermissions() {
    if (!selectedMemberId || !memberDraft) return;
    setSaving(true);
    try {
      await apiFetch("/api/client/members", {
        method: "PATCH",
        body: JSON.stringify({ memberId: selectedMemberId, permissions: memberDraft }),
      });
      setMembers((current) => current.map((member) => member.id === selectedMemberId ? { ...member, permissions: { ...memberDraft } } : member));
      toast.success("บันทึกสิทธิ์เรียบร้อยแล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "บันทึกสิทธิ์ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function changeMemberRole(member: TeamMember, value: string) {
    const patch = value.startsWith("base:")
      ? { role: value.slice(5), roleId: null }
      : { roleId: value };
    try {
      const result = await apiFetch<{ member: TeamMember }>("/api/client/members", {
        method: "PATCH",
        body: JSON.stringify({ memberId: member.id, ...patch }),
      });
      const updated = result.member;
      setMembers((current) => current.map((item) => item.id === member.id ? { ...item, ...updated } : item));
      if (selectedMemberId === member.id) {
        setMemberDraft(draftFor({ ...member, ...updated }, roles));
      }
      toast.success("อัปเดตบทบาทเรียบร้อยแล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "อัปเดตบทบาทไม่สำเร็จ");
    }
  }

  function openRoleBuilder(role: WorkspaceRole | null) {
    if (role) {
      setEditingRoleId(role.id);
      setRoleNameDraft(role.name);
      const draft = emptyDraft();
      for (const key of EDITABLE_PERMISSION_KEYS) draft[key] = Boolean(role.permissions?.[key]);
      setRolePermissionDraft(draft);
    } else {
      setEditingRoleId(null);
      setRoleNameDraft("");
      setRolePermissionDraft(emptyDraft());
    }
    setRoleModalOpen(true);
  }

  function applyRoleTemplate(templateKey: string) {
    const template = ROLE_TEMPLATES.find((item) => item.key === templateKey);
    if (!template) return;
    const draft = emptyDraft();
    for (const key of EDITABLE_PERMISSION_KEYS) draft[key] = Boolean(template.permissions[key]);
    setRolePermissionDraft(draft);
  }

  async function saveRole() {
    if (!roleNameDraft.trim()) {
      toast.error("กรุณาตั้งชื่อบทบาท");
      return;
    }
    setSaving(true);
    try {
      if (editingRoleId) {
        await apiFetch("/api/client/roles", {
          method: "PATCH",
          body: JSON.stringify({ roleId: editingRoleId, name: roleNameDraft.trim(), permissions: rolePermissionDraft }),
        });
      } else {
        await apiFetch("/api/client/roles", {
          method: "POST",
          body: JSON.stringify({ name: roleNameDraft.trim(), permissions: rolePermissionDraft }),
        });
      }
      const roleResult = await apiFetch<{ roles: WorkspaceRole[] }>("/api/client/roles");
      setRoles(roleResult.roles);
      setRoleModalOpen(false);
      toast.success(editingRoleId ? "บันทึกบทบาทเรียบร้อยแล้ว" : "สร้างบทบาทเรียบร้อยแล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "บันทึกบทบาทไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole(role: WorkspaceRole) {
    try {
      await apiFetch("/api/client/roles", {
        method: "DELETE",
        body: JSON.stringify({ roleId: role.id }),
      });
      setRoles((current) => current.filter((item) => item.id !== role.id));
      setMembers((current) => current.map((item) => item.custom_role_id === role.id ? { ...item, custom_role_id: null } : item));
      setDeleteRoleTarget(null);
      toast.success("ลบบทบาทเรียบร้อยแล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ลบบทบาทไม่สำเร็จ");
    }
  }

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) || null,
    [members, selectedMemberId],
  );

  const memberRoleLabel = (member: TeamMember) => {
    if (member.custom_role_id) {
      const role = roles.find((item) => item.id === member.custom_role_id);
      if (role) return role.name;
    }
    return member.role === "manager" ? "Manager" : "Officer";
  };

  function switchTab(next: "members" | "roles" | "audit") {
    setTab(next);
    if (next === "audit" && audit.length === 0) void loadAudit();
  }

  const tabs: { key: typeof tab; label: string }[] = [
    { key: "members", label: "สมาชิก" },
    { key: "roles", label: "บทบาท" },
    { key: "audit", label: "ประวัติ" },
  ];

  return (
    <AppShell title="ตั้งค่า > ทีมงานและสิทธิ์">
      <div className="space-y-4">
        <SettingsTabs activePath="/settings/team" />
        <SectionCard
          title="ทีมงานและสิทธิ์"
          description="สมาชิกใหม่เริ่มต้นโดยไม่มีสิทธิ์ใดๆ กำหนดบทบาทหรือเปิดสิทธิ์ให้แต่ละคนเอง"
          titleRight={
            <div className="flex gap-1 rounded-lg bg-[#F1EFE8] p-1">
              {tabs.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => switchTab(item.key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === item.key ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          }
        />

        {loading ? <Spinner /> : tab === "members" ? (
          members.length === 0 ? (
            <Card><p className="text-sm text-gray-500">ยังไม่มีสมาชิกในทีม — เพิ่มสมาชิกได้จากผู้ดูแลระบบ</p></Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <Card className="h-fit p-2">
                <div className="px-2 py-2 text-xs font-semibold text-gray-500">สมาชิกในทีม</div>
                <div className="space-y-1">
                  {members.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => selectMember(member)}
                      className={`w-full rounded-lg px-3 py-2 text-left ${selectedMemberId === member.id ? "bg-blue-50 text-primary" : "hover:bg-gray-50"}`}
                    >
                      <div className="truncate text-sm font-medium">{member.email || member.member_user_id}</div>
                      <div className="mt-0.5 text-xs text-gray-500">{memberRoleLabel(member)}{member.status === "disabled" ? " · ปิดใช้งาน" : ""}</div>
                    </button>
                  ))}
                </div>
              </Card>

              {selectedMember && memberDraft && (
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-[#1A1A18]">สิทธิ์ของ {selectedMember.email}</h2>
                      <p className="mt-1 text-xs text-gray-500">บทบาท: {memberRoleLabel(selectedMember)}</p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => setMemberDraft(emptyDraft())}>ล้างทั้งหมด</Button>
                  </div>

                  <div className="mt-4">
                    <label className="mb-1 block text-xs font-medium text-gray-600">บทบาท</label>
                    <select
                      value={selectedMember.custom_role_id ?? `base:${selectedMember.role}`}
                      onChange={(event) => void changeMemberRole(selectedMember, event.target.value)}
                      className="w-full rounded-lg border border-card-border bg-white px-3 py-2 text-sm"
                    >
                      <optgroup label="บทบาทพื้นฐาน">
                        <option value="base:manager">Manager</option>
                        <option value="base:officer">Officer</option>
                      </optgroup>
                      {roles.length > 0 && (
                        <optgroup label="บทบาทกำหนดเอง">
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>{role.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    {selectedMember.custom_role_id && (
                      <p className="mt-1 text-[11px] text-amber-600">การบันทึกสิทธิ์ด้านล่างจะมีความสำคัญเหนือบทบาทที่เลือก</p>
                    )}
                  </div>

                  <div className="mt-5">
                    <PermissionSections
                      draft={memberDraft}
                      onToggle={(key, checked) => setMemberDraft((current) => current ? { ...current, [key]: checked } : current)}
                    />
                  </div>
                  <Button className="mt-4 w-full justify-center" onClick={saveMemberPermissions} loading={saving}>บันทึกสิทธิ์</Button>
                </Card>
              )}
            </div>
          )
        ) : tab === "roles" ? (
          <div className="space-y-4">
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-[#1A1A18]">บทบาทกำหนดเอง</h2>
                  <p className="mt-1 text-xs leading-5 text-gray-500">สร้างชุดสิทธิ์ที่ใช้บ่อยเป็นบทบาท แล้วมอบหมายให้สมาชิกได้ทันที</p>
                </div>
                <Button size="sm" onClick={() => openRoleBuilder(null)}>+ สร้างบทบาท</Button>
              </div>
            </Card>

            {roles.length === 0 ? (
              <Card>
                <p className="text-sm text-gray-500">ยังไม่มีบทบาทกำหนดเอง — เริ่มจากเทมเพลตตัวอย่างหรือกำหนดเองทั้งหมดได้</p>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {roles.map((role) => {
                  const granted = EDITABLE_PERMISSION_KEYS.filter((key) => role.permissions?.[key]);
                  return (
                    <Card key={role.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-[#1A1A18]">{role.name}</h3>
                          <p className="mt-0.5 text-xs text-gray-500">{role.member_count} สมาชิก · {granted.length} สิทธิ์</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button variant="secondary" size="sm" onClick={() => openRoleBuilder(role)}>แก้ไข</Button>
                          <Button variant="danger" size="sm" onClick={() => setDeleteRoleTarget(role)} disabled={role.member_count > 0}>ลบ</Button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {granted.length === 0 ? (
                          <span className="text-xs text-gray-400">ยังไม่เปิดสิทธิ์ใดๆ</span>
                        ) : granted.map((key) => (
                          <span key={key} className="rounded-full bg-[#EAF3DE] px-2 py-0.5 text-[11px] font-medium text-[#27500A]">
                            {PERMISSION_LABELS.get(key) || key}
                          </span>
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <Card>
            <h2 className="text-sm font-semibold text-[#1A1A18]">ประวัติการเปลี่ยนแปลงล่าสุด</h2>
            {audit.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">ยังไม่มีประวัติการเปลี่ยนแปลง</p>
            ) : (
              <div className="mt-3 divide-y divide-[#F0EFE9]">
                {audit.map((entry) => (
                  <div key={entry.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-[#1A1A18]">{AUDIT_ACTION_LABELS[entry.action] || entry.action}</span>
                      <span className="text-gray-500">{entry.actor_email || "ระบบ"}</span>
                      {entry.target_email && entry.target_email !== entry.actor_email && (
                        <span className="text-gray-500">→ {entry.target_email}</span>
                      )}
                      <span className="ml-auto text-gray-400">
                        {new Date(entry.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-gray-500">{summarizeAuditChange(entry)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      <Modal
        open={roleModalOpen}
        onClose={() => { if (!saving) setRoleModalOpen(false); }}
        title={editingRoleId ? "แก้ไขบทบาท" : "สร้างบทบาทใหม่"}
        size="lg"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                label="ชื่อบทบาท"
                value={roleNameDraft}
                onChange={(event) => setRoleNameDraft(event.target.value)}
                placeholder="เช่น บัญชี ทีมขาย คลังสินค้า"
                maxLength={60}
              />
            </div>
            {!editingRoleId && (
              <div className="sm:w-56">
                <label className="mb-1 block text-xs font-medium text-gray-600">เริ่มจากเทมเพลต</label>
                <select
                  className="w-full rounded-lg border border-card-border bg-white px-3 py-2 text-sm"
                  defaultValue="blank"
                  onChange={(event) => applyRoleTemplate(event.target.value)}
                >
                  {ROLE_TEMPLATES.map((template) => (
                    <option key={template.key} value={template.key}>{template.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <PermissionSections
            draft={rolePermissionDraft}
            onToggle={(key, checked) => setRolePermissionDraft((current) => ({ ...current, [key]: checked }))}
          />

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRoleModalOpen(false)} disabled={saving}>ยกเลิก</Button>
            <Button onClick={saveRole} loading={saving}>บันทึกบทบาท</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteRoleTarget}
        onClose={() => setDeleteRoleTarget(null)}
        title="ลบบทบาท"
      >
        <p className="text-sm leading-6 text-gray-700">
          ต้องการลบบทบาท “{deleteRoleTarget?.name}” หรือไม่? สมาชิกที่ใช้บทบาทนี้จะกลับไปใช้บทบาทพื้นฐาน
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteRoleTarget(null)}>ยกเลิก</Button>
          <Button variant="danger" onClick={() => deleteRoleTarget && void deleteRole(deleteRoleTarget)}>ลบบทบาท</Button>
        </div>
      </Modal>
    </AppShell>
  );
}
