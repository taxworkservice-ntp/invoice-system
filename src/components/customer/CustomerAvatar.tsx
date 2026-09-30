import { useMemo } from "react";
import type { Customer } from "../../types";
import { avatarPalette, ink, paper } from "../../design/tokens";

interface CustomerAvatarProps {
  customer: Pick<Customer, "name" | "avatar_initials" | "avatar_color" | "avatar_hidden">;
  size?: "xs" | "sm" | "md" | "lg";
  /** Global kill-switch (tenant setting): renders nothing, the name shifts left. */
  hidden?: boolean;
  className?: string;
}

/** Thai legal-entity prefixes (full words and abbreviations) skipped for initials. */
const PREFIX_RE = /^(บริษัท|ห้างหุ้นส่วนจำกัด|ร้าน|บจก\.?|บมจ\.?|หจก\.?|หสน\.?)\s*/i;

/** Minimal shape of Intl.Segmenter (missing from the ES2020 lib). */
interface GraphemeSegmenter {
  segment(text: string): Iterable<{ segment: string }>;
}

function getSegmenter(): GraphemeSegmenter | null {
  const intl = Intl as unknown as {
    Segmenter?: new (locale: string, opts: { granularity: string }) => GraphemeSegmenter;
  };
  if (typeof intl.Segmenter === "undefined") return null;
  try {
    return new intl.Segmenter("th", { granularity: "grapheme" });
  } catch {
    return null;
  }
}

const segmenter = getSegmenter();

function graphemes(text: string): string[] {
  if (segmenter) return [...segmenter.segment(text)].map((s) => s.segment);
  return Array.from(text);
}

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function deriveInitials(name: string): string {
  const cleaned = name.replace(PREFIX_RE, "").trim();
  if (!cleaned) return "?";
  const words = cleaned.split(/\s+/).filter(Boolean);
  const firstOf = (word: string): string => graphemes(word)[0] ?? "";
  if (words.length === 1) return graphemes(words[0]).slice(0, 3).join("");
  return firstOf(words[0]) + firstOf(words[1]) + (words[2] ? firstOf(words[2]) : "");
}

function isValidHex(color: string | null | undefined): color is string {
  if (!color) return false;
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color.trim());
}

function isWhiteHex(hex: string): boolean {
  return /^#(?:fff|ffffff)$/i.test(hex.trim());
}

function contrastFg(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? ink[900] : paper.DEFAULT;
}

const SIZE_CLASSES: Record<NonNullable<CustomerAvatarProps["size"]>, string> = {
  xs: "w-7 h-7 text-label",
  sm: "w-8 h-8 text-label",
  md: "w-10 h-10 text-body",
  lg: "w-16 h-16 text-subtitle",
};

export function CustomerAvatar({
  customer,
  size = "md",
  hidden = false,
  className = "",
}: CustomerAvatarProps) {
  const { bg, fg, initials, blank, outlined } = useMemo(() => {
    // Per-customer opt-out (or pre-migration rows without the column, which
    // read as undefined and stay visible): blank box keeps rows aligned.
    if (customer.avatar_hidden === true) {
      return {
        bg: paper.DEFAULT,
        fg: ink[900],
        initials: "",
        blank: true,
        outlined: true,
      };
    }
    // Grapheme-aware so Thai combining marks are never split from their base.
    const raw = (customer.avatar_initials?.trim() || deriveInitials(customer.name)).toUpperCase();
    const initials = graphemes(raw).slice(0, 3).join("") || "?";
    if (isValidHex(customer.avatar_color)) {
      const hex = customer.avatar_color.trim();
      if (isWhiteHex(hex)) {
        return { bg: paper.DEFAULT, fg: ink[900], initials, blank: false, outlined: true };
      }
      return { bg: hex, fg: contrastFg(hex), initials, blank: false, outlined: false };
    }
    const palette = avatarPalette[hashName(customer.name) % avatarPalette.length];
    return { bg: palette.bg, fg: palette.fg, initials, blank: false, outlined: false };
  }, [customer.avatar_color, customer.avatar_initials, customer.avatar_hidden, customer.name]);

  if (hidden) return null;

  return (
    <div
      role="img"
      aria-label={customer.name}
      className={`shrink-0 rounded-control flex items-center justify-center font-semibold select-none ${SIZE_CLASSES[size]} ${blank || outlined ? "border border-card-border" : ""} ${className}`}
      style={{ backgroundColor: bg, color: fg }}
    >
      {blank ? null : initials}
    </div>
  );
}
