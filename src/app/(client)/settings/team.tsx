import { useEffect, useState } from "react";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Spinner } from "../../../components/ui/Spinner";
import { SettingsTabs } from "./_components/SettingsTabs";
import { useToast } from "../../../hooks/useToast";
import { apiFetch } from "../../../lib/api";
import { getWorkspacePermissions, type WorkspacePermissions } from "../../../lib/permissions";
import type { ClientMemberRole, ClientMemberStatus } from "../../../types";

interface TeamMember {
  id: string;
  member_user_id: string;
  email: string;
  role: ClientMemberRole;
  status: ClientMemberStatus;
  permissions: Partial<WorkspacePermissions> | null;
}

const ACTIONS: { key: keyof WorkspacePermissions; label: string; description: string }[] = [
  { key: "canCreateEditDocuments", label: "จัดทำและแก้ไขร่าง", description: "สร้างงานขายและแก้ไขเอกสารร่าง" },
  { key: "canManageCustomers", label: "จัดการลูกค้า", description: "สร้างและแก้ไขข้อมูลลูกค้า" },
  { key: "canManageCatalog", label: "จัดการสินค้าและสต็อก", description: "เพิ่มสินค้า แก้ไขรายการ และจัดการสต็อก" },
  { key: "canManageWht", label: "ออกหนังสือหัก ณ ที่จ่าย", description: "จัดทำ แก้ไข และออกเอกสารหัก ณ ที่จ่าย" },
  { key: "canSendQuotations", label: "ส่งใบเสนอราคา", description: "ส่งใบเสนอราคาให้ลูกค้า" },
  { key: "canSendDeliveryNotes", label: "ยืนยันใบส่งของ", description: "ยืนยันการส่งของและตัดสต็อก" },
  { key: "canSendFinancialDocuments", label: "ออกบิลและรับเอกสารการเงิน", description: "ส่งใบแจ้งหนี้ ใบวางบิล และเอกสารภาษี" },
  { key: "canRecordPayments", label: "บันทึกรับเงิน", description: "บันทึกรับชำระและออกใบเสร็จ" },
  { key: "canViewReports", label: "ดูรายงานและดาวน์โหลด", description: "เปิดรายงาน ศูนย์ดาวน์โหลด และไฟล์ส่งออก" },
  { key: "canVoidDocuments", label: "ยกเลิกเอกสาร", description: "ยกเลิกเอกสารที่ส่งแล้วหรือออกใหม่" },
  { key: "canDeleteDocuments", label: "ลบฉบับร่าง", description: "ลบเอกสารฉบับร่างถาวร" },
  { key: "canManageSettings", label: "ตั้งค่าบริษัท", description: "แก้ไขข้อมูลบริษัท ภาษี เทมเพลต และการตั้งค่าเอกสาร" },
];

const PERMISSION_SECTIONS: { title: string; keys: (keyof WorkspacePermissions)[] }[] = [
  {
    title: "เอกสารและการส่ง",
    keys: ["canCreateEditDocuments", "canSendQuotations", "canSendDeliveryNotes", "canSendFinancialDocuments"],
  },
  {
    title: "การเงิน",
    keys: ["canRecordPayments", "canManageWht", "canVoidDocuments"],
  },
  {
    title: "ข้อมูลพื้นฐาน",
    keys: ["canManageCustomers", "canManageCatalog", "canViewReports"],
  },
  {
    title: "ระบบ",
    keys: ["canDeleteDocuments", "canManageSettings"],
  },
];

export default function SettingsTeamPage() {
  const toast = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorkspacePermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadMembers() {
    setLoading(true);
    try {
      const result = await apiFetch<{ members: TeamMember[] }>("/api/client/members");
      setMembers(result.members);
      if (result.members.length > 0) selectMember(result.members[0]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "โหลดข้อมูลทีมไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  function selectMember(member: TeamMember) {
    setSelectedId(member.id);
    setDraft(getWorkspacePermissions(member.role, member.permissions));
  }

  useEffect(() => {
    void loadMembers();
  }, []);

  async function savePermissions() {
    if (!selectedId || !draft) return;
    setSaving(true);
    try {
      await apiFetch(`/api/client/members`, {
        method: "PATCH",
        body: JSON.stringify({ memberId: selectedId, permissions: draft }),
      });
      setMembers((current) => current.map((member) => member.id === selectedId ? { ...member, permissions: draft } : member));
      toast.success("บันทึกสิทธิ์เรียบร้อยแล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "บันทึกสิทธิ์ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const selectedMember = members.find((member) => member.id === selectedId) || null;

  return (
    <AppShell title="ตั้งค่า > ทีมงานและสิทธิ์">
      <div className="space-y-4">
        <SettingsTabs activePath="/settings/team" />
        <Card>
          <div>
            <h2 className="text-base font-semibold text-[#1A1A18]">ทีมงานและสิทธิ์</h2>
            <p className="mt-1 text-xs leading-5 text-gray-500">กำหนดว่าแต่ละคนทำงานขายและจัดการเอกสารได้แค่ไหน</p>
          </div>
        </Card>

        {loading ? <Spinner /> : members.length === 0 ? (
          <Card><p className="text-sm text-gray-500">ยังไม่มีสมาชิกในทีม</p></Card>
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
                    className={`w-full rounded-lg px-3 py-2 text-left ${selectedId === member.id ? "bg-blue-50 text-primary" : "hover:bg-gray-50"}`}
                  >
                    <div className="truncate text-sm font-medium">{member.email || member.member_user_id}</div>
                    <div className="mt-0.5 text-xs text-gray-500">{member.role === "manager" ? "Manager" : "Officer"}</div>
                  </button>
                ))}
              </div>
            </Card>

            {selectedMember && draft && (
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-[#1A1A18]">สิทธิ์ของ {selectedMember.email}</h2>
                    <p className="mt-1 text-xs text-gray-500">บทบาทเริ่มต้น: {selectedMember.role === "manager" ? "Manager" : "Officer"}</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setDraft(getWorkspacePermissions(selectedMember.role))}>ค่าเริ่มต้น</Button>
                </div>
                <div className="mt-4 space-y-5">
                  {PERMISSION_SECTIONS.map((section) => (
                    <div key={section.title}>
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                        {section.title}
                      </div>
                      <div className="space-y-2">
                        {section.keys.map((key) => {
                          const action = ACTIONS.find((a) => a.key === key);
                          if (!action) return null;
                          const checked = Boolean(draft[action.key]);
                          return (
                            <label key={key} className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-[#E8E6DF] p-3 hover:bg-[#FBFAF7]">
                              <span>
                                <span className="block text-sm font-medium text-[#1A1A18]">{action.label}</span>
                                <span className="mt-1 block text-xs leading-5 text-gray-500">{action.description}</span>
                              </span>
                              <span className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full ${checked ? "bg-primary" : "bg-gray-300"}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => setDraft((current) => current ? { ...current, [action.key]: event.target.checked } : current)}
                                  className="sr-only"
                                />
                                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <Button className="mt-4 w-full justify-center" onClick={savePermissions} loading={saving}>บันทึกสิทธิ์</Button>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
