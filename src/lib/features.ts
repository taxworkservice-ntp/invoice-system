import type { ClientFeatureKey } from "../types";

export const CLIENT_FEATURES: {
  key: ClientFeatureKey;
  label: string;
  description: string;
}[] = [
  {
    key: "service_job_details",
    label: "Service job details",
    description:
      "For print/custom production businesses that need color, foil, size, position, material, and remarks per service line.",
  },
  {
    key: "classic_v2_template",
    label: "คลาสสิก V2 Template",
    description:
      "Allow this client to select the Classic V2 PDF template in document settings (no discount column, wider QTY field).",
  },
  {
    key: "dn_appendix",
    label: "DN Appendix (ภาคผนวกใบส่งของ)",
    description:
      "แสดงตัวเลือกแนบภาคผนวกรายละเอียดการส่งของในหน้าออกใบแจ้งหนี้จากใบส่งของ เมื่อเปิดใช้ ใบแจ้งหนี้จะแสดงรายการแบบกระชับ และแนบตารางเปรียบเทียบ ส่งแล้ว vs เรียกเก็บ ตามใบส่งของท้ายเอกสาร",
  },
];
