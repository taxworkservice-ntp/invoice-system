import { MANUAL_STAGES, MANUAL_STAGE_LABELS } from "../../lib/dealStages";
import { ActionMenu } from "../ui/ActionMenu";

export interface DealStageMenuProps {
  value: string | null;
  busy?: boolean;
  canEdit?: boolean;
  onChange: (value: string | null) => void;
}

export function DealStageMenu({
  value,
  busy = false,
  canEdit = false,
  onChange,
}: DealStageMenuProps) {
  if (!canEdit) return null;

  return (
    <ActionMenu
      triggerLabel="ตัวเลือกสถานะงานขาย"
      align="left"
      disabled={busy}
      sections={[
        {
          key: "stage",
          label: "สถานะบนหน้าหลัก",
          description: "ใช้เมื่อสถานะอัตโนมัติไม่ตรงกับความจริง",
          items: [
            {
              key: "auto",
              label: "อัตโนมัติ",
              kind: "radio",
              checked: !value,
              disabled: busy,
              onSelect: () => onChange(null),
            },
            ...MANUAL_STAGES.map((stage) => ({
              key: stage,
              label: MANUAL_STAGE_LABELS[stage],
              kind: "radio" as const,
              checked: value === stage,
              disabled: busy,
              onSelect: () => onChange(stage),
            })),
          ],
        },
      ]}
    />
  );
}
