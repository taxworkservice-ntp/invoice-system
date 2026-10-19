import { CheckCircle2, Package, Wrench } from "lucide-react";

type ItemType = "product" | "service";

interface Props {
  /** `null` = nothing chosen yet (create path starts here on purpose). */
  value: ItemType | null;
  onChange: (value: ItemType) => void;
  disabled?: boolean;
  /** Last type this workspace created — shown as a hint, never preselected. */
  hintValue?: ItemType | null;
  error?: string;
  name?: string;
}

const TYPE_COPY: Record<ItemType, { title: string; description: string }> = {
  product: {
    title: "สินค้า",
    description: "นับสต็อก · มีหน่วยและหน่วยรอง · ตั้งจุดแจ้งเตือนได้",
  },
  service: {
    title: "บริการ",
    description: "ไม่นับสต็อก · ใส่รายละเอียดงาน/ขนาดได้",
  },
};

const TYPE_ORDER: ItemType[] = ["product", "service"];

/**
 * Required "สินค้า หรือ บริการ" choice for a catalog item.
 *
 * The fork changes what the record *is* (stock-counted vs not) and which fields
 * the form shows, so it must not read as a passive tab with a silent default —
 * officers were typing into the name field and saving everything as a product.
 * Radio-cards with their consequence spelled out; nothing is preselected.
 */
export function TypeSelector({
  value,
  onChange,
  disabled,
  hintValue = null,
  error,
  name = "catalog-item-type",
}: Props) {
  const Icon = (type: ItemType) => (type === "product" ? Package : Wrench);
  return (
    <fieldset className={disabled ? "opacity-60" : ""}>
      <legend className="mb-1 block text-label font-medium text-ink-600">
        ประเภท
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {TYPE_ORDER.map((type) => {
          const copy = TYPE_COPY[type];
          const active = value === type;
          const TypeIcon = Icon(type);
          return (
            <label
              key={type}
              className={`flex cursor-pointer items-start gap-3 rounded-card border p-3 transition-colors ${
                disabled ? "cursor-not-allowed" : ""
              } ${
                active
                  ? "border-success-border bg-white"
                  : "border-card-border bg-white hover:border-line-strong"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={type}
                checked={active}
                disabled={disabled}
                onChange={() => onChange(type)}
                className="mt-1 h-4 w-4 shrink-0 accent-primary"
              />
              <span className={`mt-0.5 shrink-0 ${active ? "text-paid-text" : "text-ink-400"}`}>
                <TypeIcon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-body font-medium text-ink-900">{copy.title}</span>
                  {active ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-paid-bg px-2 py-0.5 text-label font-medium text-paid-text">
                      <CheckCircle2 className="h-3 w-3" />
                      เลือกแล้ว
                    </span>
                  ) : hintValue === type ? (
                    <span className="rounded-full bg-ink-50 px-2 py-0.5 text-label font-medium text-ink-500">
                      ครั้งก่อน
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-label leading-5 text-ink-600">
                  {copy.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {error ? <p className="mt-1 text-label text-danger">{error}</p> : null}
    </fieldset>
  );
}
