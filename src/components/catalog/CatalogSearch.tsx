import { useState, useEffect } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function CatalogSearch({ value, onChange }: Props) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => onChange(local), 200);
    return () => clearTimeout(timer);
  }, [local, onChange]);

  return (
    <input
      type="text"
      className="w-full bg-page-bg border-[0.5px] border-card-border rounded-control px-[14px] py-[10px] text-body placeholder-ink-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
      placeholder="Search by item name or SKU..."
      value={local}
      onChange={(e) => setLocal(e.target.value)}
    />
  );
}
