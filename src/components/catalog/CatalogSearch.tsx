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
      className="w-full bg-[#F7F6F3] border-[0.5px] border-[#E8E6DF] rounded-lg px-[14px] py-[10px] text-[14px] placeholder-[#AAAAAA] focus:outline-none focus:border-[#378ADD] focus:ring-1 focus:ring-[#378ADD]/20 transition-colors"
      placeholder="Search by item name or SKU..."
      value={local}
      onChange={(e) => setLocal(e.target.value)}
    />
  );
}
