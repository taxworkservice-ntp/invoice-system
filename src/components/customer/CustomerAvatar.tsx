import { useMemo } from "react";
import type { Customer } from "../../types";

interface CustomerAvatarProps {
  customer: Pick<Customer, "name" | "avatar_initials" | "avatar_color">;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const PALETTE = [
  { bg: "#E8F1FB", fg: "#378ADD" },
  { bg: "#FDE9E7", fg: "#C2410C" },
  { bg: "#E6F4EA", fg: "#1E7E34" },
  { bg: "#FEF3E2", fg: "#B45309" },
  { bg: "#F0E7F8", fg: "#7C3AED" },
  { bg: "#FCE7F3", fg: "#BE185D" },
  { bg: "#E0F2F1", fg: "#0F766E" },
  { bg: "#E3F2FD", fg: "#1565C0" },
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function deriveInitials(name: string): string {
  const cleaned = name
    .replace(/^บริษัท\s+|^ห้างหุ้นส่วนจำกัด\s+|^ร้าน\s+/i, "")
    .trim();
  if (!cleaned) return "?";
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function isValidHex(color: string | null | undefined): color is string {
  if (!color) return false;
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color.trim());
}

function contrastFg(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1A1A18" : "#FFFFFF";
}

const SIZE_CLASSES: Record<NonNullable<CustomerAvatarProps["size"]>, string> = {
  sm: "w-8 h-8 text-[11px]",
  md: "w-10 h-10 text-[13px]",
  lg: "w-16 h-16 text-[18px]",
};

export function CustomerAvatar({ customer, size = "md", className = "" }: CustomerAvatarProps) {
  const { bg, fg, initials } = useMemo(() => {
    if (isValidHex(customer.avatar_color)) {
      const hex = customer.avatar_color;
      return {
        bg: hex,
        fg: contrastFg(hex),
        initials: (customer.avatar_initials || deriveInitials(customer.name)).toUpperCase().slice(0, 2),
      };
    }
    const palette = PALETTE[hashName(customer.name) % PALETTE.length];
    return {
      bg: palette.bg,
      fg: palette.fg,
      initials: (customer.avatar_initials || deriveInitials(customer.name)).toUpperCase().slice(0, 2),
    };
  }, [customer.avatar_color, customer.avatar_initials, customer.name]);

  return (
    <div
      className={`shrink-0 rounded-lg flex items-center justify-center font-semibold select-none ${SIZE_CLASSES[size]} ${className}`}
      style={{ backgroundColor: bg, color: fg }}
      aria-label={customer.name}
    >
      {initials}
    </div>
  );
}
