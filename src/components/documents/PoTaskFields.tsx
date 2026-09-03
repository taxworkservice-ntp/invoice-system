import { useId } from "react";
import { Briefcase, Hash, AlertTriangle } from "lucide-react";

interface PoTaskFieldsProps {
  taskName: string;
  onTaskNameChange: (value: string) => void;
  customerPo: string;
  onCustomerPoChange: (value: string) => void;
  /** Distinct past values for this customer (recurring jobs → pick-not-type). */
  taskSuggestions?: string[];
  poSuggestions?: string[];
  /** Where a prefilled value came from, e.g. "QT-2569-001" / "DN-102". */
  sourceHint?: string | null;
  /** Doc numbers whose value differs from the prefill — amber warning. */
  poConflicts?: string[];
  taskConflicts?: string[];
  className?: string;
}

function ReferenceInput({
  icon,
  label,
  value,
  onChange,
  placeholder,
  suggestions,
  listId,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  suggestions?: string[];
  listId: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          list={suggestions && suggestions.length > 0 ? listId : undefined}
          className="w-full pl-9 pr-3 py-2 text-sm border border-card-border rounded-lg bg-white focus:outline-none focus:border-primary"
        />
        {suggestions && suggestions.length > 0 && (
          <datalist id={listId}>
            {suggestions.slice(0, 20).map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        )}
      </div>
    </div>
  );
}

/**
 * ชื่องาน (JOB NAME) + เลขที่ใบสั่งซื้อ (PO NO.) — shared two-column row for
 * every form that creates PO/task-bearing documents. Both optional; values
 * print in the classic V2 info band and reserve pagination space per row.
 */
export function PoTaskFields({
  taskName,
  onTaskNameChange,
  customerPo,
  onCustomerPoChange,
  taskSuggestions,
  poSuggestions,
  sourceHint,
  poConflicts,
  taskConflicts,
  className = "",
}: PoTaskFieldsProps) {
  const taskListId = useId();
  const poListId = useId();
  const hasConflicts = (poConflicts && poConflicts.length > 0) || (taskConflicts && taskConflicts.length > 0);

  return (
    <div className={className}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ReferenceInput
          icon={<Briefcase size={14} />}
          label="ชื่องาน (JOB NAME)"
          value={taskName}
          onChange={onTaskNameChange}
          placeholder="เช่น งานติดตั้งไฟโรงงาน A"
          suggestions={taskSuggestions}
          listId={taskListId}
        />
        <ReferenceInput
          icon={<Hash size={14} />}
          label="เลขที่ใบสั่งซื้อ (PO NO.)"
          value={customerPo}
          onChange={onCustomerPoChange}
          placeholder="เช่น PO-2569-001"
          suggestions={poSuggestions}
          listId={poListId}
        />
      </div>
      {sourceHint && !hasConflicts && (
        <p className="mt-1 text-[11px] text-gray-400">ค่าอัตโนมัติจาก {sourceHint} — แก้ไขได้</p>
      )}
      {hasConflicts && (
        <div className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-4 text-amber-700">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <div className="space-y-0.5">
            {taskConflicts && taskConflicts.length > 0 && (
              <div>ชื่องาน: {taskConflicts.join(", ")} ระบุต่างออก — โปรดตรวจสอบ</div>
            )}
            {poConflicts && poConflicts.length > 0 && (
              <div>PO: {poConflicts.join(", ")} ระบุต่างออก — โปรดตรวจสอบ</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
