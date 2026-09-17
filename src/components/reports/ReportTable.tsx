import type { ReactNode } from "react";
import { Card } from "../ui/Card";
import { TABLE } from "../../lib/tableStyles";

export interface ReportColumn<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

interface Props<T> {
  title: string;
  /** Optional caption under the title (scope / basis / truncation note). */
  note?: string;
  columns: ReportColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyText?: string;
  /** Makes the first column sticky on narrow screens. */
  stickyFirstColumn?: boolean;
  onRowClick?: (row: T) => void;
}

/**
 * Compact report table shared by the summary sections of /reports (aging,
 * revenue by type, top customers, WHT). Uses the same `TABLE` tokens as every
 * other table in the app so the report reads as one system, and keeps the
 * horizontal-scroll behaviour on phones.
 */
export function ReportTable<T>({
  title,
  note,
  columns,
  rows,
  rowKey,
  emptyText = "ไม่มีข้อมูล",
  stickyFirstColumn = false,
  onRowClick,
}: Props<T>) {
  return (
    <Card className="border-[0.5px]">
      <div className="border-b border-line-faint px-4 py-3">
        <h3 className="text-label font-semibold text-ink-500">
          {title}
          {note && <span className="ml-2 font-normal normal-case text-ink-200">{note}</span>}
        </h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-body text-ink-300">{emptyText}</p>
      ) : (
        <div className={TABLE.scrollBody}>
          <table className={`${TABLE.table} min-w-[360px]`}>
            <thead>
              <tr className={TABLE.theadTr}>
                {columns.map((col, index) => (
                  <th
                    key={col.key}
                    className={`${TABLE.thStatic} ${
                      index === 0 && stickyFirstColumn ? TABLE.thSticky : ""
                    } ${col.align === "right" ? "text-right" : ""}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={`${TABLE.tbodyTr} group`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col, index) => (
                    <td
                      key={col.key}
                      className={`px-3 py-3 md:py-2 ${
                        index === 0 && stickyFirstColumn ? TABLE.tdSticky : ""
                      } ${col.align === "right" ? "text-right tabular-nums" : ""}`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
