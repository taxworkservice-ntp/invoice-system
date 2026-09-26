import { formatBuddhistDate } from "../../../lib/dates";
import { CLIENT_FEATURES } from "../../../lib/features";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import type { AdminClientMember } from "../../../lib/adminApi";
import type { ClientFeature, ClientProfile, Document } from "../../../types";
import type { AdminClientTabId } from "./shared";
import { SectionHeader } from "./shared";

interface OverviewTabProps {
  clientProfile: ClientProfile;
  email: string;
  isActive: boolean;
  accountError: string;
  documents: Document[];
  dealCount: number;
  members: AdminClientMember[];
  features: ClientFeature[];
  toggling: boolean;
  onToggleActive: () => void;
  onRetry: () => void;
  onGoTab: (tab: AdminClientTabId) => void;
}

export function OverviewTab({
  clientProfile,
  email,
  isActive,
  accountError,
  documents,
  dealCount,
  members,
  features,
  toggling,
  onToggleActive,
  onRetry,
  onGoTab,
}: OverviewTabProps) {
  const featuresOn = features.filter((f) => f.enabled).length;

  return (
    <div className="space-y-4">
      {accountError && (
        <div className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2.5 text-label leading-5 text-amber-900">
          <span className="font-medium">โหลดข้อมูลบัญชีไม่สำเร็จ:</span> {accountError}
          <span className="text-amber-800/80"> ข้อมูลอื่นด้านล่างแสดงตามปกติ</span>
          <button
            type="button"
            onClick={() => void onRetry()}
            className="ml-2 font-medium text-primary-deep hover:underline"
          >
            ลองใหม่
          </button>
        </div>
      )}

      <div>
        <SectionHeader>ข้อมูลลูกค้า</SectionHeader>
        <Card>
          <div className="space-y-2">
            <div>
              <span className="text-label text-ink-300">ชื่อบริษัท</span>
              <p className="text-body text-ink-900 font-medium">
                {clientProfile.company_name_th || "-"}
              </p>
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
                  {clientProfile.default_wht_rate === "0"
                    ? "ไม่มี"
                    : `${clientProfile.default_wht_rate}%`}
                </p>
              </div>
              <div>
                <span className="text-label text-ink-300">สถานะ</span>
                <p className="text-body">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-control text-label font-medium ${accountError ? "bg-draft-bg text-ink-300" : isActive ? "bg-paid-bg text-paid-text" : "bg-draft-bg text-ink-300"}`}
                  >
                    {accountError ? "ไม่ทราบสถานะ" : isActive ? "ใช้งานอยู่" : "ปิดการใช้งาน"}
                  </span>
                </p>
              </div>
            </div>
            <div className="pt-1">
              <span className="text-label text-ink-300">
                สร้างบัญชีเมื่อ: {formatBuddhistDate(clientProfile.created_at)}
              </span>
              <span className="text-label text-ink-300 ml-4">
                เอกสารทั้งหมด: {documents.length >= 10 ? "10+" : documents.length}
              </span>
              <span className="text-label text-ink-300 ml-4">งานขาย: {dealCount}</span>
            </div>
          </div>
        </Card>
      </div>

      <div>
        <SectionHeader>ภาพรวมการใช้งาน</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "เอกสาร", value: documents.length >= 10 ? "10+" : String(documents.length) },
            { label: "งานขาย", value: String(dealCount) },
            { label: "สมาชิกทีม", value: String(members.length) },
            { label: "ฟีเจอร์ที่เปิด", value: `${featuresOn}/${CLIENT_FEATURES.length}` },
          ].map((stat) => (
            <div key={stat.label} className="bg-white border border-card-border rounded-card p-3">
              <div className="text-label font-medium text-ink-500">{stat.label}</div>
              <div className="text-title font-semibold text-ink-900 tabular-nums">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionHeader>ทางลัด</SectionHeader>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => onGoTab("team")}>
            จัดการทีม
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onGoTab("reports")}>
            ดึงรายงาน
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onToggleActive}
            disabled={toggling}
            className="!text-danger !border-danger/20"
          >
            {toggling ? "กำลังดำเนินการ..." : isActive ? "ปิดการใช้งานบัญชี" : "เปิดใช้งานบัญชี"}
          </Button>
        </div>
      </div>
    </div>
  );
}
