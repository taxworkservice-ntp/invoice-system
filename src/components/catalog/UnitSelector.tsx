import { useState } from "react";
import { UNIT_OPTIONS } from "./constants";

interface Props {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
  customPresets?: string[];
  onAddPreset?: (value: string) => void;
}

export function UnitSelector({ value, onChange, label, disabled, customPresets = [], onAddPreset }: Props) {
  const initialCustom = value && !UNIT_OPTIONS.includes(value) && !customPresets.includes(value);
  const [showCustom, setShowCustom] = useState(initialCustom);
  const [customValue, setCustomValue] = useState(initialCustom ? value : "");
  const isCustomSelected = value && !UNIT_OPTIONS.includes(value) && !customPresets.includes(value);

  return (
    <div className="space-y-2">
      {label && (
        <div className="text-label font-semibold text-ink-300">
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
        className="w-full px-3 py-2 text-body border border-card-border rounded-control bg-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
      >
        <option value="" disabled>
          เลือกหน่วย...
        </option>
        {UNIT_OPTIONS.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
        {customPresets.filter((u) => !UNIT_OPTIONS.includes(u)).map((unit) => (
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
          onBlur={() => {
            if (customValue.trim() && onAddPreset) {
              onAddPreset(customValue.trim());
              setShowCustom(false);
            }
          }}
          placeholder="พิมพ์ชื่อหน่วยเอง"
          className="w-full px-3 py-2 text-body border border-card-border rounded-control focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
          autoFocus
        />
      )}
    </div>
  );
}
