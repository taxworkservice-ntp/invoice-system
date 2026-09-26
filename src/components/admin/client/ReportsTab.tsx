import { useState } from "react";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Select } from "../../ui/Input";
import { SectionHeader } from "./shared";

const REPORT_MONTHS = [
  { value: 1, label: "มกราคม" },
  { value: 2, label: "กุมภาพันธ์" },
  { value: 3, label: "มีนาคม" },
  { value: 4, label: "เมษายน" },
  { value: 5, label: "พฤษภาคม" },
  { value: 6, label: "มิถุนายน" },
  { value: 7, label: "กรกฎาคม" },
  { value: 8, label: "สิงหาคม" },
  { value: 9, label: "กันยายน" },
  { value: 10, label: "ตุลาคม" },
  { value: 11, label: "พฤศจิกายน" },
  { value: 12, label: "ธันวาคม" },
];

const PLANNED_REPORTS = [
  { id: "sso110", label: "สปส.1-10 รายเดือน", hint: "ค่าจ้าง + เงินสมทบรวมทั้งเดือน" },
  { id: "joiners", label: "เข้าใหม่ประจำเดือน (สปส.1-03)", hint: "พร้อมกำหนดยื่นภายใน 30 วัน" },
  { id: "leavers", label: "ลาออกประจำเดือน (สปส.6-09)", hint: "พร้อมกำหนดยื่นภายในวันที่ 15" },
  { id: "roster", label: "รายชื่อประกันสังคม", hint: "ค่าจ้าง + เงินสมทบทุกคน" },
  { id: "summary", label: "สรุปเงินเดือน", hint: "รอบที่ปิดแล้วเท่านั้น" },
];

/**
 * Phase 2 shell: month context + report inventory. Downloads land here;
 * every entry exports finalized rounds only (drafts surface a warning).
 */
export function ReportsTab() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  return (
    <div className="space-y-4">
      <div>
        <SectionHeader>รายงานลูกค้า</SectionHeader>
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-label text-ink-500">รอบรายงาน</span>
            <Select
              aria-label="เดือนรายงาน"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-[118px]"
            >
              {REPORT_MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="ปีรายงาน"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-[88px]"
            >
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>
                  {y + 543}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-3 space-y-2">
            {PLANNED_REPORTS.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between gap-3 rounded-control border border-card-border bg-paper-tint px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-body font-medium text-ink-900">{report.label}</div>
                  <div className="text-label text-ink-400">{report.hint}</div>
                </div>
                <Button size="sm" variant="secondary" disabled>
                  เร็ว ๆ นี้
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-3 text-label leading-5 text-ink-400">
            รายงานยื่นภาษีและประกันสังคมจะดาวน์โหลดได้จากที่นี่ในเฟสถัดไป รวมเฉพาะรอบที่ปิดแล้ว
            หากเดือนที่เลือกยังมีรอบร่างจะแจ้งเตือนก่อน
          </p>
        </Card>
      </div>
    </div>
  );
}
