export function formatCurrency(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function sanitizeFilename(name: string, fallback = "doc"): string {
  let s = name
    .replace(/\s+/g, "_")
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/_+/g, "_")
    .replace(/^[_.\s]+|[_.\s]+$/g, "")
    .trim();
  if (!s || s === "." || s === "..") return fallback;
  return s;
}