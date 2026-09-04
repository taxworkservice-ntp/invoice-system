import { splitRefDateSuffix } from "../../lib/format";

/**
 * Item name with a smaller date suffix for single-line ref rows
 * ("DO-2026-09-003 วันที่: 1 ก.ย. 2569"). Normal names render unchanged.
 */
export function RefItemName({ name }: { name: string }) {
  const split = splitRefDateSuffix(name);
  if (!split) return <>{name}</>;
  return (
    <>
      {split.main} <span className="print-ref-date">วันที่: {split.date}</span>
    </>
  );
}
