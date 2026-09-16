/**
 * Shared helpers for every file download in the app (Download Center,
 * Documents bulk export, reports). Keeping blob/CSV/filename logic here means
 * one implementation instead of the copies that used to live in each page.
 */

/** Trigger a browser download for an in-memory blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  // Quote when the value contains a delimiter, quote or newline; double
  // embedded quotes so the file survives Excel/Sheets parsing.
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Build an RFC-4180-safe CSV string (no BOM). */
export function buildCsv(headers: readonly string[], rows: readonly unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return lines.join("\r\n");
}

/** CSV blob with a UTF-8 BOM so Thai text opens correctly in Excel. */
export function buildCsvBlob(headers: readonly string[], rows: readonly unknown[][]): Blob {
  return new Blob(["\uFEFF" + buildCsv(headers, rows)], { type: "text/csv;charset=utf-8;" });
}

/** Filesystem/zip-safe filename segment. Keeps Thai characters. */
export function sanitizeFilenamePart(name: string): string {
  return (name || "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9\u0E00-\u0E7F\-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/**
 * Mirror of the server's PDF filename so batch zips have meaningful names
 * even though the client builds them (the API returns only bytes).
 */
export function documentPdfFilename(
  docNumber: string | null | undefined,
  companyName?: string | null,
  issueDate?: string | null,
): string {
  const parts = [docNumber || "doc"];
  const safeName = sanitizeFilenamePart(companyName || "");
  if (safeName) parts.push(safeName);
  parts.push((issueDate ? String(issueDate) : new Date().toISOString()).slice(0, 10));
  return `${parts.join("_")}.pdf`;
}

/** `prefix_YYYY-MM-DD.ext`, the naming used across exports. */
export function datedFilename(prefix: string, extension: string, date: Date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  return `${prefix}_${stamp}.${extension.replace(/^\./, "")}`;
}
