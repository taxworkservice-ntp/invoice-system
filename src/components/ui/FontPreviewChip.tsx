import { CLASSIC_V2_BASE_FONT_PT } from "../../constants";

interface FontPreviewChipProps {
  /** Font-scale multiplier relative to the 7.5pt base reading text. */
  mult: number;
}

/** Renders "กA" at the real resulting size — instant visual confirmation. */
export function FontPreviewChip({ mult }: FontPreviewChipProps) {
  return (
    <span
      className="inline-flex h-[38px] min-w-[56px] shrink-0 items-center justify-center rounded-control border border-card-border bg-white px-2 leading-none text-ink-900"
      style={{ fontSize: `calc(${CLASSIC_V2_BASE_FONT_PT}pt * ${mult})` }}
      title="ตัวอย่างขนาดจริงของข้อความหลัก"
    >
      กAa
    </span>
  );
}
