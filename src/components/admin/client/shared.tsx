import type { ReactNode } from "react";

export const AUDIT_ACTION_LABELS: Record<string, string> = {
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
  "client-deleted": "ลบลูกค้าถาวร",
  "backup.downloaded": "ดาวน์โหลด backup",
  "backup.restored": "กู้คืนข้อมูลจาก backup",
};

export function SectionHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-label font-semibold text-ink-300">{children}</div>
      {action}
    </div>
  );
}

export type AdminClientTabId =
  "overview" | "features" | "team" | "documents" | "reports" | "activity" | "manage";

export const ADMIN_CLIENT_TABS: { id: AdminClientTabId; label: string }[] = [
  { id: "overview", label: "ภาพรวม" },
  { id: "features", label: "ฟีเจอร์" },
  { id: "team", label: "ทีม" },
  { id: "documents", label: "เอกสาร" },
  { id: "reports", label: "รายงาน" },
  { id: "activity", label: "กิจกรรม" },
  { id: "manage", label: "การจัดการ" },
];
