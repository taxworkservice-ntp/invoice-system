import { useState } from "react";
import { UNIT_OPTIONS } from "./constants";

interface Props {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
}

export function UnitSelector({ value, onChange, label, disabled }: Props) {
  const initialCustom = value && !UNIT_OPTIONS.includes(value);
  const [showCustom, setShowCustom] = useState(initialCustom);
  const [customValue, setCustomValue] = useState(initialCustom ? value : "");
  const isCustomSelected = value && !UNIT_OPTIONS.includes(value);

  return (
    <div className="space-y-2">
      {label && (
        <div className="text-[11px] uppercase font-semibold text-[#888780]">
          {label}
        </div>
      )}
      <select
        value={isCustomSelected ? "custom" : value}
        onChange={(e) => {
          if (e.target.value === "custom") {
            setShowCustom(true);
            setCustomValue("");
            onChange("");
          } else {
            setShowCustom(false);
            onChange(e.target.value);
          }
        }}
        disabled={disabled}
        className="w-full px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20 transition-colors"
      >
        <option value="" disabled>
          เลือกหน่วย...
        </option>
        {UNIT_OPTIONS.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
        <option value="custom">กำหนดเอง...</option>
      </select>
      {showCustom && (
        <input
          type="text"
          value={customValue}
          onChange={(e) => {
            setCustomValue(e.target.value);
            onChange(e.target.value);
          }}
          placeholder="หน่วยที่กำหนดเอง"
          className="w-full px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20 transition-colors"
          autoFocus
        />
      )}
    </div>
  );
}
