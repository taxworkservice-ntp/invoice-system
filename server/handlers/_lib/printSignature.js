import { supabaseAdmin } from "./supabase.js";

/**
 * The print signature is part of the PDF cache key. It has two parts:
 *
 *  - the layout version, sent by the client (the code that renders the
 *    document) — a deploy that changes the print output invalidates the
 *    cached renders;
 *  - a fingerprint of the workspace's print settings, computed here from the
 *    client profile — changing a print setting (a font scale, the table lines,
 *    the column rules) invalidates that workspace's cached renders too.
 *
 * Without the second part a workspace kept serving the renders made with the
 * old settings: the preview showed the new layout, the download the old one.
 */

// The print settings that change the output. Everything else on the profile
// (the company details, the logo, the terms) belongs to the document's own
// data — a document edit already invalidates its cache.
const PRINT_SETTING_FIELDS = [
  "pdf_template",
  "pdf_font_scale",
  "classic_v2_font_scale",
  "pdf_section_font_scales",
  "classic_v2_section_font_scales",
  "pdf_type_font_scales",
  "classic_v2_type_font_scales",
  "classic_v2_full_page_header",
  "classic_v2_hide_english_labels",
  "classic_v2_compact_signature",
  "classic_v2_sign_every_page",
  "classic_v2_regular_item_font",
  "classic_v2_table_lines",
  "classic_v2_compact_dn",
  "classic_v2_column_rules_continuous",
  "signature_scale",
  "stamp_scale",
  "year_era",
];

// FNV-1a — a short, stable fingerprint. It only has to change when the
// settings change, not to be unguessable.
function fingerprint(value) {
  let hash = 0x811c9dc5;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function normalizeLayoutVersion(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 999) return 1;
  return parsed;
}

/**
 * The signature for one document's cached renders: the layout version plus
 * the workspace's print settings.
 */
export async function printSignature(userId, layoutVersion) {
  const version = normalizeLayoutVersion(layoutVersion);
  let settings = "";
  try {
    const { data, error } = await supabaseAdmin
      .from("client_profiles")
      .select(PRINT_SETTING_FIELDS.join(", "))
      .eq("user_id", userId)
      .maybeSingle();
    if (!error && data) {
      settings = PRINT_SETTING_FIELDS.map(
        (field) => `${field}=${JSON.stringify(data[field] ?? null)}`,
      ).join("|");
    }
  } catch {
    // A missing profile must not break the download: the signature falls back
    // to the layout version alone (the render is still correct, only the
    // cache is less precise).
    settings = "";
  }
  return `v${version}-${fingerprint(settings)}`;
}

export { normalizeLayoutVersion };
