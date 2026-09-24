import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import { TERMS_DOC_TYPES } from "../../../lib/terms";
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { useClientFeatures } from "../../../hooks/useClientFeatures";
import { AppShell } from "../../../components/layout/AppShell";
import { SectionCard } from "../../../components/ui/SectionCard";
import { SettingRow } from "../../../components/ui/SettingRow";
import { Switch } from "../../../components/ui/Switch";
import { Button } from "../../../components/ui/Button";
import { SaveBar } from "../../../components/ui/SaveBar";
import { Select } from "../../../components/ui/Input";
import { LogoUpload } from "../../../components/ui/LogoUpload";
import { ImageUpload } from "../../../components/ui/ImageUpload";
import { SettingsPageSkeleton } from "./_components/SettingsSkeleton";
import { useToast } from "../../../hooks/useToast";
import { LOGO_SIZE_OPTIONS, LOGO_DEFAULT_SIZE, ASSET_SCALE_OPTIONS, CLASSIC_V2_FONT_SCALE_OPTIONS, CLASSIC_V2_SECTION_FONT_KEYS, CLASSIC_V2_SECTION_INHERIT, CLASSIC_V2_TYPE_FONT_KEYS, CLASSIC_V2_TYPE_GLOBAL_KEY, CLASSIC_V2_ITEMS_TABLE_ROWS, CLASSIC_V2_SECTION_SUB_ROWS, CLASSIC_V2_SECTION_PARENT_LABELS, CLASSIC_V2_DEFAULT_SECTION_SCALES, CLASSIC_V2_BASE_FONT_PT, CLASSIC_V2_MIN_FONT_PT, CLASSIC_V2_MAX_FONT_PT, CLASSIC_V2_CUSTOM_PT_PREFIX, getClassicV2FontScaleMult, getClassicV2EffectiveFontScaleMult, getClassicV2SectionScaleMult, getClassicV2EffectiveSectionScaleMult } from "../../../constants";
import type { ClassicV2SectionFontKey } from "../../../constants";
import { FontPreviewChip } from "../../../components/ui/FontPreviewChip";
import { signatureKey as signatureKeyFn, stampKey as stampKeyFn } from "../../../lib/r2";
import { SettingsTabs } from "./_components/SettingsTabs";
import type { ClientProfile } from "../../../types";

const DOC_VISIBILITY_TYPES = [
  { key: "quotation", label: "ใบเสนอราคา" },
  { key: "invoice", label: "ใบแจ้งหนี้" },
  { key: "billing_note", label: "ใบวางบิล" },
  { key: "receipt", label: "ใบเสร็จ" },
  { key: "delivery_note", label: "ใบส่งของ" },
  { key: "credit_note", label: "ใบลดหนี้" },
  { key: "debit_note", label: "ใบเพิ่มหนี้" },
  { key: "wht", label: "หัก ณ ที่จ่าย (ภ.ง.ด.)" },
];

function ScaleRow({
  label,
  value,
  onSet,
  indent = false,
  inheritOptionLabel,
}: {
  label: string;
  value: string;
  onSet: (v: string) => void;
  indent?: boolean;
  inheritOptionLabel?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${indent ? "sm:pl-6" : ""}`}>
      <span className={`text-label ${indent ? "text-ink-500" : "text-ink-600"}`}>{label}</span>
      <div className="w-full sm:w-[280px] sm:shrink-0">
        <FontScaleControl value={value} onChange={onSet} allowInherit inheritOptionLabel={inheritOptionLabel} />
      </div>
    </div>
  );
}

/**
 * Full-width per-section scale rows: sub-groups (ตารางรายการ, header/totals
 * refinements) render indented beneath their parent row.
 */
function SectionScaleEditor({
  getValue,
  setValue,
  inheritOptionLabel,
  subInheritLabels,
  termsInheritLabel,
}: {
  getValue: (key: ClassicV2SectionFontKey) => string;
  setValue: (key: string, v: string) => void;
  inheritOptionLabel?: string;
  subInheritLabels?: { header?: string; totals?: string };
  /** "ตามลายเซ็น/ท้ายเอกสาร (7.5pt)" — the terms slot inherits the footer. */
  termsInheritLabel?: string;
}) {
  const rowProps = { inheritOptionLabel };
  const subRow = (parent: "header" | "totals") => {
    const rows = CLASSIC_V2_SECTION_SUB_ROWS[parent];
    if (!rows?.length) return null;
    return (
      <div className="mt-0.5 space-y-0.5">
        {rows.map((row) => (
          <ScaleRow
            key={row.key}
            indent
            label={row.label}
            value={getValue(row.key)}
            onSet={(v) => setValue(row.key, v)}
            inheritOptionLabel={subInheritLabels?.[parent] || `ตาม${CLASSIC_V2_SECTION_PARENT_LABELS[parent]}`}
          />
        ))}
      </div>
    );
  };
  return (
    <div className="divide-y divide-line-faint">
      <div className="py-1.5">
        <ScaleRow
          label="ส่วนหัว (ชื่อบริษัท/ลูกค้า)"
          value={getValue("header")}
          onSet={(v) => setValue("header", v)}
          {...rowProps}
        />
        {subRow("header")}
      </div>
      <div className="py-1.5">
        <p className="text-label font-semibold text-ink-400">ตารางรายการ</p>
        <div className="mt-0.5 space-y-0.5">
          {CLASSIC_V2_ITEMS_TABLE_ROWS.map((row) => (
            <ScaleRow
              key={row.key}
              indent
              label={row.label}
              value={getValue(row.key)}
              onSet={(v) => setValue(row.key, v)}
              {...rowProps}
            />
          ))}
        </div>
        <p className="mt-1 text-label leading-snug text-ink-400">
          โหมดแบบอ้างอิง (ตารางใบส่งของ) ใช้ขนาด “ตัวเลข/จำนวน” กับ “หัวตาราง/คอลัมน์” — ตารางนั้นไม่มีคอลัมน์คำอธิบายสินค้า
        </p>
      </div>
      <div className="py-1.5">
        <ScaleRow
          label="ยอดรวม"
          value={getValue("totals")}
          onSet={(v) => setValue("totals", v)}
          {...rowProps}
        />
        {subRow("totals")}
      </div>
      <div className="py-1.5">
        <ScaleRow
          label="เงื่อนไขท้ายเอกสาร"
          value={getValue("terms")}
          onSet={(v) => setValue("terms", v)}
          inheritOptionLabel={termsInheritLabel || rowProps.inheritOptionLabel}
        />
      </div>
      <ScaleRow
        label="ลายเซ็น/ท้ายเอกสาร"
        value={getValue("footer")}
        onSet={(v) => setValue("footer", v)}
        {...rowProps}
      />
      <ScaleRow
        label="ป้ายภาษาอังกฤษ (ใต้ข้อความไทย)"
        value={getValue("en")}
        onSet={(v) => setValue("en", v)}
        {...rowProps}
      />
    </div>
  );
}

const pillClass = (active: boolean) =>
  `rounded-control border px-3 py-2 text-label transition-colors ${active ? "border-primary bg-primary-soft text-primary-deep font-medium" : "border-card-border bg-white text-ink-600 hover:border-line-strong"}`;

const FONT_CUSTOM = "__custom__";

/** Human label for any font-scale value — presets use their pt label, custom pt shows the number. */
function fontScaleLabel(value: string): string {
  if (value.startsWith(CLASSIC_V2_CUSTOM_PT_PREFIX)) {
    return `${value.slice(CLASSIC_V2_CUSTOM_PT_PREFIX.length)}pt`;
  }
  return CLASSIC_V2_FONT_SCALE_OPTIONS.find((opt) => opt.value === value)?.label || value;
}

/**
 * Font-size control used by every row of the scale panel: pt-labeled presets,
 * optional custom exact-pt input, and a live size chip.
 */
function FontScaleControl({
  value,
  onChange,
  allowInherit,
  showChip = false,
  label,
  inheritOptionLabel = "ตามขนาดหลัก",
}: {
  value: string;
  onChange: (v: string) => void;
  allowInherit: boolean;
  showChip?: boolean;
  label?: string;
  /** Text for the "inherit" option — always state what it resolves to. */
  inheritOptionLabel?: string;
}) {
  const isCustom = value.startsWith(CLASSIC_V2_CUSTOM_PT_PREFIX);
  const mult = getClassicV2FontScaleMult(value);
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <Select
          label={label}
          value={isCustom ? FONT_CUSTOM : value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === FONT_CUSTOM) {
              const pt = Math.min(
                CLASSIC_V2_MAX_FONT_PT,
                Math.max(CLASSIC_V2_MIN_FONT_PT, mult * CLASSIC_V2_BASE_FONT_PT),
              );
              onChange(`${CLASSIC_V2_CUSTOM_PT_PREFIX}${pt}`);
            } else {
              onChange(v);
            }
          }}
        >
          {allowInherit && <option value={CLASSIC_V2_SECTION_INHERIT}>{inheritOptionLabel}</option>}
          {CLASSIC_V2_FONT_SCALE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
          <option value={FONT_CUSTOM}>ขนาดเอง…</option>
        </Select>
        {isCustom && (
          <div className="mt-1 flex items-center gap-1.5">
            <input
              type="number"
              min={CLASSIC_V2_MIN_FONT_PT}
              max={CLASSIC_V2_MAX_FONT_PT}
              step={0.5}
              value={parseFloat(value.slice(CLASSIC_V2_CUSTOM_PT_PREFIX.length)) || ""}
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                if (Number.isFinite(n)) {
                  const clamped = Math.min(CLASSIC_V2_MAX_FONT_PT, Math.max(CLASSIC_V2_MIN_FONT_PT, n));
                  onChange(`${CLASSIC_V2_CUSTOM_PT_PREFIX}${clamped}`);
                }
              }}
              className="w-20 rounded-control border border-card-border bg-white px-2 py-1 text-label focus:border-primary focus:outline-none"
            />
            <span className="text-label text-ink-300">pt ({CLASSIC_V2_MIN_FONT_PT}–{CLASSIC_V2_MAX_FONT_PT})</span>
          </div>
        )}
      </div>
      {showChip && <FontPreviewChip mult={mult} />}
    </div>
  );
}

export default function SettingsDocumentsPage() {
  const { profile } = useAuth();
  const { clientProfile, loading, setClientProfile } = useClientProfile(profile?.id);
  const { hasFeature } = useClientFeatures(profile?.id);
  const toast = useToast();

  const hasClassicV2 = hasFeature("classic_v2_template");
  const [logoKey, setLogoKey] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState(LOGO_DEFAULT_SIZE);
  const [showLogo, setShowLogo] = useState(true);
  const [showCompanyName, setShowCompanyName] = useState(true);
  const [logoLayout, setLogoLayout] = useState<"left" | "above">("left");
  const [pdfTemplate, setPdfTemplate] = useState<"modern" | "classic_v2">("modern");
  const [classicV2FontScale, setClassicV2FontScale] = useState("normal");
  const [classicV2FullPageHeader, setClassicV2FullPageHeader] = useState(false);
  const [classicV2HideEnglishLabels, setClassicV2HideEnglishLabels] = useState(false);
  const [classicV2CompactSignature, setClassicV2CompactSignature] = useState(false);
  const [classicV2SignEveryPage, setClassicV2SignEveryPage] = useState(false);
  const [classicV2RegularItemFont, setClassicV2RegularItemFont] = useState(false);
  const [classicV2CompactDn, setClassicV2CompactDn] = useState(false);
  const [classicV2SectionScales, setClassicV2SectionScales] = useState<Record<ClassicV2SectionFontKey, string>>(
    CLASSIC_V2_DEFAULT_SECTION_SCALES,
  );
  const [classicV2TypeScales, setClassicV2TypeScales] = useState<Record<string, Record<string, string>>>({});
  const [scaleTab, setScaleTab] = useState<string>("default");
  const [termsTab, setTermsTab] = useState<string>("invoice");
  const [termsByType, setTermsByType] = useState<Record<string, string>>({});
  const [signatureKey, setSignatureKey] = useState<string | null>(null);
  const [stampKey, setStampKey] = useState<string | null>(null);
  const [signatureScale, setSignatureScale] = useState("medium");
  const [stampScale, setStampScale] = useState("medium");
  const [showSignatureOnWht, setShowSignatureOnWht] = useState(true);
  const [showStampOnWht, setShowStampOnWht] = useState(true);
  const [showSignatureMaster, setShowSignatureMaster] = useState(true);
  const [showStampMaster, setShowStampMaster] = useState(true);
  const [showSignatureOnDocs, setShowSignatureOnDocs] = useState<Record<string, boolean>>({});
  const [showStampOnDocs, setShowStampOnDocs] = useState<Record<string, boolean>>({});
  const [dnShowFullTotals, setDnShowFullTotals] = useState(false);
  const [dnAmountDisplay, setDnAmountDisplay] = useState<"full" | "hidden" | "blank" | null>("hidden");
  const [requireDnPriceReview, setRequireDnPriceReview] = useState(false);
  const [priceWarnPct, setPriceWarnPct] = useState("10");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const hydrateFromProfile = useCallback(() => {
    if (!clientProfile) return;
    setLogoKey(clientProfile.logo_url);
    setLogoSize(clientProfile.logo_size || LOGO_DEFAULT_SIZE);
    setShowLogo(clientProfile.show_logo !== false);
    setShowCompanyName(clientProfile.show_company_name !== false);
    setLogoLayout(clientProfile.logo_layout === "above" ? "above" : "left");
    setPdfTemplate((["modern", "classic_v2"] as const).includes(clientProfile.pdf_template) ? clientProfile.pdf_template : "modern");
    // Shared pdf_* columns are canonical; classic_v2_* is the pre-migration
    // fallback so the page still hydrates before the migration is applied.
    setClassicV2FontScale(clientProfile.pdf_font_scale ?? clientProfile.classic_v2_font_scale ?? "normal");
    setClassicV2SectionScales({
      ...CLASSIC_V2_DEFAULT_SECTION_SCALES,
      ...(clientProfile.pdf_section_font_scales ?? clientProfile.classic_v2_section_font_scales ?? {}),
    });
    setClassicV2TypeScales(clientProfile.pdf_type_font_scales ?? clientProfile.classic_v2_type_font_scales ?? {});
    setTermsByType({ ...(clientProfile.classic_terms_by_type || {}) });
    setClassicV2FullPageHeader(clientProfile.classic_v2_full_page_header === true);
    setClassicV2HideEnglishLabels(clientProfile.classic_v2_hide_english_labels === true);
    setClassicV2CompactSignature(clientProfile.classic_v2_compact_signature === true);
    setClassicV2SignEveryPage(clientProfile.classic_v2_sign_every_page === true);
    setClassicV2RegularItemFont(clientProfile.classic_v2_regular_item_font === true);
    setClassicV2CompactDn(clientProfile.classic_v2_compact_dn === true);
    setSignatureKey(clientProfile.signature_url || null);
    setStampKey(clientProfile.stamp_url || null);
    setSignatureScale(clientProfile.signature_scale || "medium");
    setStampScale(clientProfile.stamp_scale || "medium");
    setShowSignatureOnWht(clientProfile.show_signature_on_wht !== false);
    setShowStampOnWht(clientProfile.show_stamp_on_wht !== false);
    setShowSignatureOnDocs(DOC_VISIBILITY_TYPES.reduce((acc, t) => {
      if (t.key === "wht") {
        acc[t.key] = clientProfile.show_signature_on_wht !== false;
      } else {
        const map = clientProfile.show_signature_on_docs as Record<string, boolean> | null;
        acc[t.key] = map ? (map[t.key] !== false) : true;
      }
      return acc;
    }, {} as Record<string, boolean>));
    const sigMap = clientProfile.show_signature_on_docs as Record<string, boolean> | null;
    setShowSignatureMaster(!sigMap || !Object.values(sigMap).every(v => v === false));
    const stpMap = clientProfile.show_stamp_on_docs as Record<string, boolean> | null;
    setShowStampMaster(!stpMap || !Object.values(stpMap).every(v => v === false));
    setShowStampOnDocs(DOC_VISIBILITY_TYPES.reduce((acc, t) => {
      if (t.key === "wht") {
        acc[t.key] = clientProfile.show_stamp_on_wht !== false;
      } else {
        const map = clientProfile.show_stamp_on_docs as Record<string, boolean> | null;
        acc[t.key] = map ? (map[t.key] !== false) : true;
      }
      return acc;
    }, {} as Record<string, boolean>));
    setDnShowFullTotals(clientProfile.delivery_note_show_full_totals === true);
    setDnAmountDisplay(clientProfile.delivery_note_amount_display ?? null);
    setRequireDnPriceReview(clientProfile.require_dn_price_review === true);
    setPriceWarnPct(
      clientProfile.price_deviation_warn_pct != null
        ? String(clientProfile.price_deviation_warn_pct)
        : "10",
    );
  }, [clientProfile]);

  useEffect(() => {
    hydrateFromProfile();
  }, [hydrateFromProfile]);

  async function handleSave() {
    if (!profile || !clientProfile) return;
    setSaving(true);
    setError("");
    setSaved(false);

    const trimmedWarnPct = priceWarnPct.trim();
    const parsedWarnPct = trimmedWarnPct === "" ? 10 : parseFloat(trimmedWarnPct);
    if (!Number.isFinite(parsedWarnPct) || parsedWarnPct < 0 || parsedWarnPct > 100) {
      setError("กรุณากรอกเกณฑ์แจ้งเตือนราคาระหว่าง 0-100%");
      setSaving(false);
      return;
    }

    // Drop 'inherit' entries so only explicit overrides persist.
    const classicV2TypeFontScalesPayload = Object.fromEntries(
      Object.entries(classicV2TypeScales).map(([typeKey, scales]) => [
        typeKey,
        Object.fromEntries(Object.entries(scales).filter(([, v]) => v && v !== CLASSIC_V2_SECTION_INHERIT)),
      ]),
    );

    const payload: Record<string, unknown> = {
      price_deviation_warn_pct: parsedWarnPct,
      require_dn_price_review: requireDnPriceReview,
      logo_url: logoKey,
      logo_size: logoSize,
      show_logo: showLogo,
      show_company_name: showCompanyName,
      logo_layout: logoLayout,
      pdf_template: pdfTemplate,
      classic_v2_full_page_header: classicV2FullPageHeader,
      classic_v2_hide_english_labels: classicV2HideEnglishLabels,
      classic_v2_compact_signature: classicV2CompactSignature,
      classic_v2_sign_every_page: classicV2SignEveryPage,
      classic_v2_regular_item_font: classicV2RegularItemFont,
      classic_v2_compact_dn: classicV2CompactDn,
      // Shared pdf_* (canonical) + classic_v2_* (kept in sync so a rollback to
      // the previous build, which reads classic_v2_*, loses nothing).
      pdf_font_scale: classicV2FontScale,
      pdf_section_font_scales: classicV2SectionScales,
      pdf_type_font_scales: classicV2TypeFontScalesPayload,
      classic_v2_font_scale: classicV2FontScale,
      classic_v2_section_font_scales: classicV2SectionScales,
      classic_v2_type_font_scales: classicV2TypeFontScalesPayload,
      classic_terms_by_type: termsByType,
      signature_url: signatureKey,
      stamp_url: stampKey,
      signature_scale: signatureScale,
      stamp_scale: stampScale,
      show_signature_on_wht: showSignatureOnWht,
      show_stamp_on_wht: showStampOnWht,
      delivery_note_show_full_totals: dnShowFullTotals,
      delivery_note_amount_display: dnAmountDisplay,
      show_signature_on_docs: !showSignatureMaster
        ? DOC_VISIBILITY_TYPES.filter(t => t.key !== "wht").reduce((acc, t) => ({ ...acc, [t.key]: false }), {})
        : (DOC_VISIBILITY_TYPES.filter(t => t.key !== "wht").every(t => showSignatureOnDocs[t.key] !== false) ? null : DOC_VISIBILITY_TYPES.filter(t => t.key !== "wht").reduce((acc, t) => ({ ...acc, [t.key]: showSignatureOnDocs[t.key] !== false }), {} as Record<string, boolean>)),
      show_stamp_on_docs: !showStampMaster
        ? DOC_VISIBILITY_TYPES.filter(t => t.key !== "wht").reduce((acc, t) => ({ ...acc, [t.key]: false }), {})
        : (DOC_VISIBILITY_TYPES.filter(t => t.key !== "wht").every(t => showStampOnDocs[t.key] !== false) ? null : DOC_VISIBILITY_TYPES.filter(t => t.key !== "wht").reduce((acc, t) => ({ ...acc, [t.key]: showStampOnDocs[t.key] !== false }), {} as Record<string, boolean>)),
    };

    let { error: err } = await supabase
      .from("client_profiles")
      .update(payload)
      .eq("user_id", profile.id);

    if (err && (err.message.includes("price_deviation_warn_pct") || err.message.includes("classic_v2_regular_item_font") || err.message.includes("classic_terms_by_type") || err.message.includes("pdf_font_scale") || err.message.includes("pdf_section_font_scales") || err.message.includes("pdf_type_font_scales"))) {
      // One of the pending migrations (add_price_deviation_warn_pct,
      // add_classic_v2_regular_item_font, add_classic_terms_by_type,
      // add_pdf_font_scale) not applied yet — save everything else so the
      // page never breaks on schema lag. classic_v2_* stays in the fallback
      // payload, so pre-migration saves still persist the font settings.
      const {
        price_deviation_warn_pct: _pending,
        classic_v2_regular_item_font: _pendingFont,
        classic_terms_by_type: _pendingTerms,
        pdf_font_scale: _pendingPdfScale,
        pdf_section_font_scales: _pendingPdfSections,
        pdf_type_font_scales: _pendingPdfTypes,
        ...fallbackPayload
      } = payload;
      ({ error: err } = await supabase
        .from("client_profiles")
        .update(fallbackPayload)
        .eq("user_id", profile.id));
      if (!err) {
        toast.error("บันทึกแล้ว แต่บางค่าตั้งค่ายังไม่มีผล — กรุณารัน migration ที่ค้างอยู่ใน sql/");
      }
    }

    if (err) {
      setError(err.message);
      toast.error(err.message);
    } else {
      setSaved(true);
      toast.success("บันทึกแล้ว");
      setClientProfile({
        ...clientProfile,
        ...payload,
        price_deviation_warn_pct: parsedWarnPct,
        require_dn_price_review: requireDnPriceReview,
      } as ClientProfile);
    }
    setSaving(false);
  }

  async function saveAssetField(field: "logo_url" | "signature_url" | "stamp_url", key: string | null) {
    if (!profile || !clientProfile) return;

    setError("");
    setSaved(false);

    const payload: Record<string, unknown> = { [field]: key };
    if (field === "logo_url" && key) {
      payload.show_logo = true;
    }

    const { error: err } = await supabase
      .from("client_profiles")
      .update(payload)
      .eq("user_id", profile.id);

    if (err) {
      setError(err.message);
      toast.error(err.message);
      return;
    }

    setSaved(true);
    setClientProfile({
      ...clientProfile,
      ...payload,
    } as ClientProfile);
  }

  if (loading) return <AppShell width="form" title="ตั้งค่า > รูปแบบเอกสาร"><SettingsPageSkeleton /></AppShell>;

  const isDirty =
    pdfTemplate !== (clientProfile?.pdf_template || "modern") ||
    classicV2FullPageHeader !== (clientProfile?.classic_v2_full_page_header === true) ||
    classicV2HideEnglishLabels !== (clientProfile?.classic_v2_hide_english_labels === true) ||
    classicV2CompactSignature !== (clientProfile?.classic_v2_compact_signature === true) ||
    classicV2SignEveryPage !== (clientProfile?.classic_v2_sign_every_page === true) ||
    classicV2RegularItemFont !== (clientProfile?.classic_v2_regular_item_font === true) ||
    classicV2CompactDn !== (clientProfile?.classic_v2_compact_dn === true) ||
    classicV2FontScale !== (clientProfile?.pdf_font_scale ?? clientProfile?.classic_v2_font_scale ?? "normal") ||
    JSON.stringify(classicV2TypeScales) !== JSON.stringify(clientProfile?.pdf_type_font_scales ?? clientProfile?.classic_v2_type_font_scales ?? {}) ||
    CLASSIC_V2_SECTION_FONT_KEYS.some(
      (key) => (classicV2SectionScales[key] || CLASSIC_V2_SECTION_INHERIT) !== ((clientProfile?.pdf_section_font_scales ?? clientProfile?.classic_v2_section_font_scales)?.[key] || CLASSIC_V2_SECTION_INHERIT),
    ) ||
    JSON.stringify(termsByType) !== JSON.stringify(clientProfile?.classic_terms_by_type || {}) ||
    logoKey !== (clientProfile?.logo_url ?? null) ||
    logoSize !== (clientProfile?.logo_size || LOGO_DEFAULT_SIZE) ||
    showLogo !== (clientProfile?.show_logo !== false) ||
    showCompanyName !== (clientProfile?.show_company_name !== false) ||
    logoLayout !== (clientProfile?.logo_layout === "above" ? "above" : "left") ||
    signatureKey !== (clientProfile?.signature_url ?? null) ||
    stampKey !== (clientProfile?.stamp_url ?? null) ||
    signatureScale !== (clientProfile?.signature_scale || "medium") ||
    stampScale !== (clientProfile?.stamp_scale || "medium") ||
    dnShowFullTotals !== (clientProfile?.delivery_note_show_full_totals === true) ||
    dnAmountDisplay !== (clientProfile?.delivery_note_amount_display ?? null) ||
    requireDnPriceReview !== (clientProfile?.require_dn_price_review === true) ||
    priceWarnPct !== (clientProfile?.price_deviation_warn_pct != null
      ? String(clientProfile.price_deviation_warn_pct)
      : "10");

  const typeScalesConfiguredCount = Object.values(classicV2TypeScales).filter((scales) =>
    Object.values(scales || {}).some((v) => v && v !== CLASSIC_V2_SECTION_INHERIT),
  ).length;
  const visibleTypeEntries = DOC_VISIBILITY_TYPES.filter((t) => (CLASSIC_V2_TYPE_FONT_KEYS as string[]).includes(t.key));
  const selectedTypeLabel = DOC_VISIBILITY_TYPES.find((t) => t.key === scaleTab)?.label || scaleTab;

  // Live specimen preview: effective size per section for the active tab.
  const isDefaultScaleTab = scaleTab === "default";
  const tabTypeScales = isDefaultScaleTab ? undefined : classicV2TypeScales[scaleTab];
  const specimenGlobalMult = isDefaultScaleTab
    ? getClassicV2FontScaleMult(classicV2FontScale)
    : getClassicV2EffectiveFontScaleMult(
        undefined,
        tabTypeScales?.[CLASSIC_V2_TYPE_GLOBAL_KEY],
        classicV2FontScale,
      );
  const specimenMult = (section: ClassicV2SectionFontKey) =>
    isDefaultScaleTab
      ? getClassicV2SectionScaleMult(section, classicV2SectionScales, specimenGlobalMult)
      : getClassicV2EffectiveSectionScaleMult(section, tabTypeScales, classicV2SectionScales, specimenGlobalMult);
  const specimenRows = [
    { label: "ส่วนหัว", mult: specimenMult("header"), text: "บริษัท ตัวอย่าง จำกัด · 02-123-4567" },
    { label: "ชื่อบริษัท (ไทย+อังกฤษ)/ที่อยู่", mult: specimenMult("header_company"), text: "บริษัท ตัวอย่าง จำกัด" },
    { label: "ชื่อเอกสาร/ตราสำเนา", mult: specimenMult("header_title"), text: "ใบแจ้งหนี้ / INVOICE" },
    { label: "กล่องข้อมูล/ลูกค้า", mult: specimenMult("header_info"), text: "เลขที่: INV-2609-0001 · วันที่" },
    { label: "ชื่อสินค้า/คำอธิบาย", mult: specimenMult("items"), text: "ปูนซีเมนต์ออลพัรโพส บรรจุถุง ทดสอบการตัดคำชื่อสินค้ายาว" },
    { label: "ตัวเลข/จำนวน", mult: specimenMult("num"), text: "12 × 350.00 = 4,200.00" },
    { label: "คอลัมน์หน่วย", mult: specimenMult("num_unit"), text: "ชิ้น / ถัง / กล่อง" },
    { label: "หัวตาราง", mult: specimenMult("thead"), text: "รายการ จำนวน หน่วย ราคา จำนวนเงิน" },
    { label: "ยอดรวม", mult: specimenMult("totals"), text: "ยอดรวมทั้งสิ้น / NET PAYABLE" },
    { label: "ยอดรวมสุดท้าย", mult: specimenMult("totals_net"), text: "ยอดรวมทั้งสิ้น 12,500.00" },
    { label: "ข้อมูลการชำระเงิน", mult: specimenMult("payment"), text: "ธนาคาร: ธนาคารตัวอย่าง · เลขที่บัญชี 123-4-56789-0" },
    { label: "เงื่อนไขท้ายเอกสาร", mult: specimenMult("terms"), text: "ชำระเงินภายใน 30 วันนับจากวันที่ออกเอกสาร" },
    { label: "ป้ายภาษาอังกฤษ", mult: specimenMult("en"), text: "INVOICE · SUB TOTAL · AUTHORIZED BY" },
    { label: "ลายเซ็น/ท้ายเอกสาร", mult: specimenMult("footer"), text: "ผู้มีอำนาจลงนาม / วันที่" },
  ];
  // Sub-row inherit labels state the parent group's effective size, e.g.
  // "ตามส่วนหัว (9pt)" — mirrors the "ตามขนาดหลัก (7.5pt)" convention.
  const multToPtLabel = (mult: number) =>
    `${parseFloat((mult * CLASSIC_V2_BASE_FONT_PT).toFixed(2))}pt`;
  const subInheritLabels = {
    header: `ตามส่วนหัว (${multToPtLabel(specimenMult("header"))})`,
    totals: `ตามยอดรวม (${multToPtLabel(specimenMult("totals"))})`,
  };
  const termsInheritLabel = `ตามลายเซ็น/ท้ายเอกสาร (${multToPtLabel(specimenMult("footer"))})`;

  return (
    <AppShell width="form" title="ตั้งค่า > รูปแบบเอกสาร">
      <div className="space-y-4">
        <SettingsTabs activePath="/settings/documents" />

        <SectionCard title="โลโก้และชื่อบริษัท" description="โลโก้และข้อมูลหัวเอกสารที่พิมพ์ทุกฉบับ">
          <div className="divide-y divide-line-faint">
            <div className="pb-2">
              {profile && (
                <LogoUpload
                  userId={profile.id}
                  currentLogoKey={logoKey}
                  onLogoChange={(k) => {
                    setLogoKey(k);
                    if (k) setShowLogo(true);
                    void saveAssetField("logo_url", k);
                  }}
                />
              )}
              <p className="-mt-1 pb-2 text-label text-ink-300">
                โลโก้ตัวอักษรแนวนอน: ใช้ไฟล์พื้นหลังโปร่งใส กว้าง ≥1200px เว้นขอบรอบตัวอักษร — ระบบจะคงสัดส่วนและจำกัดความสูงให้เอง
              </p>
            </div>
            {logoKey && (
              <>
                <SettingRow
                  label="ขนาดโลโก้บนเอกสาร"
                  description="ความกว้างเมื่อพิมพ์ — โลโก้แนวนอน (ตัวอักษร) จะถูกจำกัดความสูงอัตโนมัติให้หัวเอกสารสมดุล"
                  controlWidthClass="sm:w-[220px]"
                >
                  <Select
                    value={logoSize}
                    onChange={(e) => { setLogoSize(e.target.value); setSaved(false); }}
                  >
                    {LOGO_SIZE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label} ({opt.mm}) — {opt.desc}</option>
                    ))}
                  </Select>
                  <div className="mt-2 flex items-center gap-2">
                    <div
                      className="h-5 rounded bg-ink-800"
                      style={{ width: Math.round((LOGO_SIZE_OPTIONS.find((o) => o.value === logoSize)?.px ?? 64) * (220 / 312)) }}
                      aria-hidden
                    />
                    <span className="text-label text-ink-300">
                      กว้าง {LOGO_SIZE_OPTIONS.find((o) => o.value === logoSize)?.mm ?? "~17มม."} · สูงไม่เกิน 15มม. (แบนเนอร์ 22มม.)
                    </span>
                  </div>
                  {logoSize === "large" && showCompanyName && (
                    <p className="mt-1 text-label text-ink-300">
                      แบนเนอร์มักมีชื่อบริษัทอยู่ในโลโก้แล้ว — แนะนำให้ปิด “แสดงชื่อบริษัทในเอกสาร” ด้านล่าง
                    </p>
                  )}
                </SettingRow>
                <SettingRow
                  label="ตำแหน่งโลโก้"
                  description={!showLogo
                    ? "โลโก้ถูกซ่อนในเอกสาร — ตำแหน่งจะมีผลเมื่อเปิดแสดงโลโก้"
                    : !showCompanyName
                      ? "เมื่อปิดชื่อบริษัท โลโก้จะแสดงด้านบนอยู่แล้ว — ตำแหน่งมีผลเมื่อเปิดชื่อบริษัท"
                      : "“ด้านบน” วางโลโก้ชิดซ้ายเหนือชื่อบริษัท — แก้การเลื่อนเมื่อชื่อยาว"}
                  controlWidthClass="sm:w-[280px]"
                >
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setLogoLayout("left"); setSaved(false); }}
                      className={`flex-1 ${pillClass(logoLayout === "left")}`}
                    >
                      ชิดซ้าย
                    </button>
                    <button
                      type="button"
                      onClick={() => { setLogoLayout("above"); setSaved(false); }}
                      className={`flex-1 ${pillClass(logoLayout === "above")}`}
                    >
                      ด้านบน
                    </button>
                  </div>
                </SettingRow>
                <SettingRow label="แสดงโลโก้ในเอกสาร" controlAlign="right">
                  <Switch checked={showLogo} onChange={(checked) => { setShowLogo(checked); setSaved(false); }} />
                </SettingRow>
              </>
            )}
            <SettingRow
              label="แสดงชื่อบริษัทในเอกสาร"
              description={!showCompanyName ? 'เมื่อปิดชื่อบริษัท ที่อยู่ เลขผู้เสียภาษี และเบอร์โทรจะขยับขึ้นไปอยู่ข้างโลโก้แทนที่ชื่อ — โลโก้คงขนาดที่เลือกไว้' : undefined}
              controlAlign="right"
            >
              <Switch checked={showCompanyName} onChange={(checked) => { setShowCompanyName(checked); setSaved(false); }} />
            </SettingRow>
          </div>
        </SectionCard>

        <SectionCard title="เทมเพลตเอกสาร" description="รูปแบบ PDF และข้อความท้ายเอกสาร — มีผลกับเอกสารใหม่เท่านั้น">
          <div className="divide-y divide-line-faint">
            <SettingRow
              label="เทมเพลต PDF"
              description="เทมเพลตเริ่มต้นสำหรับเอกสารทุกประเภท มีผลกับเอกสารใหม่เท่านั้น"
              controlWidthClass="sm:w-[260px]"
            >
              <Select
                value={pdfTemplate}
                onChange={(e) => { setPdfTemplate(e.target.value as "modern" | "classic_v2"); setSaved(false); }}
              >
                <option value="modern">โมเดิร์น (Modern)</option>
                {hasClassicV2 && <option value="classic_v2">คลาสสิก V2</option>}
              </Select>
            </SettingRow>
            {pdfTemplate === "classic_v2" && hasClassicV2 && (
              <SettingRow
                label="หัวกระดาษเต็มรูปแบบทุกหน้า (คลาสสิก V2)"
                description="พิมพ์โลโก้ ชื่อบริษัท และข้อมูลลูกค้าซ้ำทุกหน้าของเอกสารหลายหน้า — ใช้กระดาษมากขึ้น (ปิด = หน้าต่อไปใช้แถบสรุปแบบกระชับ)"
                controlAlign="right"
              >
                <Switch checked={classicV2FullPageHeader} onChange={(checked) => { setClassicV2FullPageHeader(checked); setSaved(false); }} />
              </SettingRow>
            )}
            {pdfTemplate === "classic_v2" && hasClassicV2 && (
              <SettingRow
                label="ซ่อนป้ายภาษาอังกฤษ (คลาสสิก V2)"
                description="พิมพ์เฉพาะป้ายภาษาไทยในตารางรายการ กล่องข้อมูล และยอดรวม — ประหยัดพื้นที่แนวตั้ง เหมาะกับเอกสารลูกค้าไทย (ชื่อบริษัทภาษาอังกฤษยังแสดงตามปกติ)"
                controlAlign="right"
              >
                <Switch checked={classicV2HideEnglishLabels} onChange={(checked) => { setClassicV2HideEnglishLabels(checked); setSaved(false); }} />
              </SettingRow>
            )}
            {pdfTemplate === "classic_v2" && hasClassicV2 && (
              <SettingRow
                label="ลายเซ็น/ท้ายเอกสารกระชับ (คลาสสิก V2)"
                description="ลดความสูงช่องลายเซ็นและตราประทับ — เหลือพื้นที่สำหรับรายการสินค้ามากขึ้น"
                controlAlign="right"
              >
                <Switch checked={classicV2CompactSignature} onChange={(checked) => { setClassicV2CompactSignature(checked); setSaved(false); }} />
              </SettingRow>
            )}
            {pdfTemplate === "classic_v2" && hasClassicV2 && (
              <SettingRow
                label="เซ็นกำกับทุกหน้า (คลาสสิก V2)"
                description="พิมพ์แถบลงชื่อแบบกระชับท้ายทุกหน้าที่ยังไม่ใช่หน้าสุดท้าย (หน้าสุดท้ายมีช่องลายเซ็นเต็มรูปแบบตามเดิม) — ใช้กระดาษมากขึ้นเล็กน้อย"
                controlAlign="right"
              >
                <Switch checked={classicV2SignEveryPage} onChange={(checked) => { setClassicV2SignEveryPage(checked); setSaved(false); }} />
              </SettingRow>
            )}
            {pdfTemplate === "classic_v2" && hasClassicV2 && (
              <SettingRow
                label="ตัวหนังสือปกติในตารางรายการ (คลาสสิก V2)"
                description="แสดงข้อความในตารางรายการทุกประเภทเอกสารด้วยน้ำหนักปกติทั้งหมด — ไม่มีหัวตารางหรือยอดเงินตัวหนา"
                controlAlign="right"
              >
                <Switch checked={classicV2RegularItemFont} onChange={(checked) => { setClassicV2RegularItemFont(checked); setSaved(false); }} />
              </SettingRow>
            )}
            {pdfTemplate === "classic_v2" && hasClassicV2 && (
              <SettingRow
                label="ใบส่งของ: ระยะห่างกระชับ (คลาสสิก V2)"
                description="ลดระยะขอบ/ช่องว่างในใบส่งของ (หัวเอกสาร กล่องข้อมูล รายการ และช่องว่างระหว่างกลุ่ม) ให้ได้หลายรายการต่อหน้า โดยไม่ลดขนาดตัวอักษร — มีผลกับใบส่งของเท่านั้น"
                controlAlign="right"
              >
                <Switch checked={classicV2CompactDn} onChange={(checked) => { setClassicV2CompactDn(checked); setSaved(false); }} />
              </SettingRow>
            )}
          </div>
        </SectionCard>

        {(pdfTemplate === "classic_v2" || pdfTemplate === "modern") && (
          <SectionCard
            title={pdfTemplate === "modern" ? "ขนาดตัวอักษร (โมเดิร์น)" : "ขนาดตัวอักษร (คลาสสิก V2)"}
            description="ปรับให้ผู้สูงอายุอ่านได้ชัดขึ้น — ระบบคำนวณจำนวนรายการต่อหน้าให้อัตโนมัติ"
          >
            <div className="mb-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => { setScaleTab("default"); setSaved(false); }}
                className={pillClass(scaleTab === "default")}
              >
                ค่าเริ่มต้น (ทุกประเภท)
              </button>
              {visibleTypeEntries.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { setScaleTab(t.key); setSaved(false); }}
                  className={pillClass(scaleTab === t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {scaleTab === "default" ? (
              <div className="divide-y divide-line-faint">
                <SettingRow
                  label="ขนาดหลัก (ทั้งเอกสาร)"
                  description="ขนาดฐานของเอกสาร — ทุกส่วนด้านล่างที่ตั้งเป็น “ตามขนาดหลัก” จะใช้ขนาดนี้"
                  controlWidthClass="sm:w-[300px]"
                >
                  <FontScaleControl
                    value={classicV2FontScale}
                    onChange={(v) => { setClassicV2FontScale(v); setSaved(false); }}
                    allowInherit={false}
                    showChip
                  />
                </SettingRow>
                <div className="py-2.5">
                  <div className="text-label font-medium text-ink-700">ปรับขนาดเฉพาะส่วน</div>
                  <p className="mt-0.5 text-label text-ink-300">
                    ส่วนที่ตั้งเป็น “ตามขนาดหลัก” จะปรับตามขนาดหลักด้านบนทันที — รายการย่อยที่ตั้งเป็น “ตาม…” จะปรับตามกลุ่มแม่ของตัวเอง
                    ช่องตัวเลขขนาดใหญ่มากอาจล้นคอลัมน์แคบ
                  </p>
                  <div className="mt-1">
                    <SectionScaleEditor
                      getValue={(key) => classicV2SectionScales[key] || CLASSIC_V2_SECTION_INHERIT}
                      setValue={(key, v) => { setClassicV2SectionScales({ ...classicV2SectionScales, [key]: v }); setSaved(false); }}
                      inheritOptionLabel={`ตามขนาดหลัก (${fontScaleLabel(classicV2FontScale)})`}
                      subInheritLabels={subInheritLabels}
                      termsInheritLabel={termsInheritLabel}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-line-faint">
                <SettingRow
                  label={`${selectedTypeLabel} — ขนาดหลัก`}
                  description="ขนาดฐานของประเภทนี้ — เว้นไว้ที่ “ตามค่าเริ่มต้น” เพื่อใช้ขนาดหลักของแท็บค่าเริ่มต้น"
                  controlWidthClass="sm:w-[300px]"
                >
                  {(() => {
                    const current = classicV2TypeScales[scaleTab] || {};
                    return (
                      <FontScaleControl
                        value={current[CLASSIC_V2_TYPE_GLOBAL_KEY] || CLASSIC_V2_SECTION_INHERIT}
                        onChange={(v) => { setClassicV2TypeScales({ ...classicV2TypeScales, [scaleTab]: { ...current, [CLASSIC_V2_TYPE_GLOBAL_KEY]: v } }); setSaved(false); }}
                        allowInherit
                        showChip
                        inheritOptionLabel="ตามค่าเริ่มต้น (ทุกประเภท)"
                      />
                    );
                  })()}
                </SettingRow>
                <div className="py-2.5">
                  <div className="text-label font-medium text-ink-700">ปรับขนาดเฉพาะส่วน</div>
                  <p className="mt-0.5 text-label text-ink-300">
                    ใช้กับ{selectedTypeLabel}ทุกฉบับ — หน้าแก้ไขเอกสารแต่ละฉบับยังตั้งทับได้อีกชั้น
                  </p>
                  <div className="mt-1">
                    <SectionScaleEditor
                      getValue={(key) => (classicV2TypeScales[scaleTab] || {})[key] || CLASSIC_V2_SECTION_INHERIT}
                      setValue={(key, v) => {
                        const current = classicV2TypeScales[scaleTab] || {};
                        setClassicV2TypeScales({ ...classicV2TypeScales, [scaleTab]: { ...current, [key]: v } });
                        setSaved(false);
                      }}
                      inheritOptionLabel={`ตามขนาดหลักของ${selectedTypeLabel} (${fontScaleLabel(
                        (classicV2TypeScales[scaleTab] || {})[CLASSIC_V2_TYPE_GLOBAL_KEY] || classicV2FontScale,
                      )})`}
                      subInheritLabels={subInheritLabels}
                      termsInheritLabel={termsInheritLabel}
                    />
                  </div>
                </div>
              </div>
            )}
            <div className="mt-3 rounded-control border border-card-border bg-paper-field p-3">
              <p className="mb-2 text-label font-semibold text-ink-400">ตัวอย่างขนาดจริง</p>
              <div className="space-y-1.5">
                {specimenRows.map((row) => (
                  <div key={row.label} className="flex items-baseline gap-3">
                    <span className="w-[120px] shrink-0 text-label text-ink-400">{row.label}</span>
                    <span className="min-w-0 truncate text-ink-700" style={{ fontSize: `calc(${CLASSIC_V2_BASE_FONT_PT}pt * ${row.mult})` }}>
                      {row.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
        </SectionCard>
        )}

        <SectionCard title="ข้อความเงื่อนไขท้ายเอกสาร (รายประเภทเอกสาร)" description="หนึ่งบรรทัดต่อหนึ่งข้อ — เว้นว่างไว้หากประเภทนั้นไม่ต้องการเงื่อนไข">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {DOC_VISIBILITY_TYPES.filter((t) => (TERMS_DOC_TYPES as readonly string[]).includes(t.key)).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTermsTab(t.key)}
                className={pillClass(termsTab === t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={termsByType[termsTab] ?? ""}
            onChange={(e) => { setTermsByType({ ...termsByType, [termsTab]: e.target.value }); setSaved(false); }}
            rows={4}
            placeholder="เว้นว่าง = ไม่แสดงเงื่อนไขท้ายเอกสารประเภทนี้"
            className="w-full px-3 py-2 text-body border border-card-border rounded-control bg-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
          />
          <p className="text-label text-ink-300 mt-1">
            {DOC_VISIBILITY_TYPES.find((t) => t.key === termsTab)?.label || termsTab}
            {(() => {
              const lines = termsByType[termsTab]?.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) ?? [];
              return lines.length > 0 ? ` — ${lines.length} ข้อ` : " — ไม่พิมพ์เงื่อนไข";
            })()}
            {!(termsTab in termsByType) && (clientProfile?.classic_terms || "").trim() ? " (ยังไม่กำหนด — ใช้ข้อความกลางเดิมอยู่)" : ""}
          </p>
        </SectionCard>

        <SectionCard title="ลายเซ็นและตราประทับ" description="ปรากฏท้ายเอกสาร — การตั้งค่ามีผลกับเอกสารใหม่ที่สร้างหลังจากบันทึก">
          {profile && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="space-y-1">
                <ImageUpload
                  userId={profile.id}
                  storageKeyFn={signatureKeyFn}
                  currentKey={signatureKey}
                  onKeyChange={(k) => {
                    setSignatureKey(k);
                    void saveAssetField("signature_url", k);
                  }}
                  label="ลายเซ็น"
                />
                {signatureKey && (
                  <>
                    <SettingRow label="ขนาดลายเซ็น" controlWidthClass="sm:w-[140px]">
                      <Select value={signatureScale} onChange={(e) => { setSignatureScale(e.target.value); setSaved(false); }}>
                        {ASSET_SCALE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </Select>
                    </SettingRow>
                    <div className="py-1.5 sm:pl-4">
                      <Switch
                        checked={showSignatureMaster}
                        onChange={(on) => {
                          setShowSignatureMaster(on);
                          const next: Record<string, boolean> = {};
                          DOC_VISIBILITY_TYPES.forEach(t => { next[t.key] = on; });
                          setShowSignatureOnDocs(next);
                          setShowSignatureOnWht(on);
                          setSaved(false);
                        }}
                        label="แสดงลายเซ็นในเอกสาร"
                      />
                    </div>
                    {showSignatureMaster && (
                      <div className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2 sm:gap-y-1 sm:pl-4">
                        {DOC_VISIBILITY_TYPES.map((t) => (
                          <label key={t.key} className="flex min-h-9 items-center gap-2 cursor-pointer py-0.5">
                            <input
                              type="checkbox"
                              checked={showSignatureOnDocs[t.key] !== false}
                              onChange={(e) => {
                                setShowSignatureOnDocs({ ...showSignatureOnDocs, [t.key]: e.target.checked });
                                if (t.key === "wht") setShowSignatureOnWht(e.target.checked);
                                setSaved(false);
                              }}
                              className="h-4 w-4 shrink-0 accent-primary rounded"
                            />
                            <span className="text-label text-ink-500 select-none">{t.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="space-y-1">
                <ImageUpload
                  userId={profile.id}
                  storageKeyFn={stampKeyFn}
                  currentKey={stampKey}
                  onKeyChange={(k) => {
                    setStampKey(k);
                    void saveAssetField("stamp_url", k);
                  }}
                  label="ตราประทับ"
                />
                {stampKey && (
                  <>
                    <SettingRow label="ขนาดตราประทับ" controlWidthClass="sm:w-[140px]">
                      <Select value={stampScale} onChange={(e) => { setStampScale(e.target.value); setSaved(false); }}>
                        {ASSET_SCALE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </Select>
                    </SettingRow>
                    <div className="py-1.5 sm:pl-4">
                      <Switch
                        checked={showStampMaster}
                        onChange={(on) => {
                          setShowStampMaster(on);
                          const next: Record<string, boolean> = {};
                          DOC_VISIBILITY_TYPES.forEach(t => { next[t.key] = on; });
                          setShowStampOnDocs(next);
                          setShowStampOnWht(on);
                          setSaved(false);
                        }}
                        label="แสดงตราประทับในเอกสาร"
                      />
                    </div>
                    {showStampMaster && (
                      <div className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2 sm:gap-y-1 sm:pl-4">
                        {DOC_VISIBILITY_TYPES.map((t) => (
                          <label key={t.key} className="flex min-h-9 items-center gap-2 cursor-pointer py-0.5">
                            <input
                              type="checkbox"
                              checked={showStampOnDocs[t.key] !== false}
                              onChange={(e) => {
                                setShowStampOnDocs({ ...showStampOnDocs, [t.key]: e.target.checked });
                                if (t.key === "wht") setShowStampOnWht(e.target.checked);
                                setSaved(false);
                              }}
                              className="h-4 w-4 shrink-0 accent-primary rounded"
                            />
                            <span className="text-label text-ink-500 select-none">{t.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="ใบส่งของ" description="ค่าเริ่มต้นสำหรับใบส่งของใหม่ — มีผลกับเอกสารใหม่เท่านั้น เอกสารเดิมคงค่าที่บันทึกไว้">
          <SettingRow
            label="การแสดงจำนวนเงินใน PDF (ค่าเริ่มต้น)"
            description="ค่าเริ่มต้นเมื่อออกใบส่งของใหม่ · เลือก “ไม่กำหนด” เพื่อให้ผู้ใช้เลือกเองทุกครั้ง"
          >
            <Select
              value={dnAmountDisplay ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setDnAmountDisplay(v === "" ? null : (v as "full" | "hidden" | "blank"));
                setSaved(false);
              }}
            >
              <option value="">ไม่กำหนด (ต้องเลือกทุกครั้ง)</option>
              <option value="full">แสดงจำนวนเงิน — PDF แสดงราคาปกติ</option>
              <option value="hidden">ซ่อนจำนวนเงิน — แสดงเฉพาะรายการและจำนวน</option>
              <option value="blank">ฟอร์มเปล่า — เขียนมือหน้างาน</option>
            </Select>
          </SettingRow>
          <SettingRow
            label="แสดงยอดรวมแบบใบแจ้งหนี้"
            description="แสดง VAT / หัก ณ ที่จ่าย / ยอดสุทธิแบบใบแจ้งหนี้ หากปิดจะแสดงเฉพาะมูลค่ารวม"
            controlAlign="right"
          >
            <Switch checked={dnShowFullTotals} onChange={(checked) => { setDnShowFullTotals(checked); setSaved(false); }} />
          </SettingRow>
          <SettingRow
            label="บังคับยืนยันราคาทุกครั้งที่ออกใบส่งของ"
            description="เปิดแล้วจะบันทึกใบส่งของไม่ได้จนกว่าทุกรายการจะยืนยันราคา (ใบส่งของแบบฟอร์มเปล่าไม่ต้องยืนยัน)"
            controlAlign="right"
          >
            <Switch checked={requireDnPriceReview} onChange={(checked) => { setRequireDnPriceReview(checked); setSaved(false); }} />
          </SettingRow>
        </SectionCard>

        <SectionCard title="การตรวจสอบราคา" description="เตือนเมื่อราคาต่อหน่วยที่กรอกในฟอร์มเอกสารต่างจากราคาแค็ตตาล็อก — เป็นเพียงคำเตือน ไม่ได้ห้ามบันทึก">
          <SettingRow
            label="แจ้งเตือนราคาต่างจากแค็ตตาล็อก"
            description="กรอก 0 เพื่อปิดการแจ้งเตือน · เว้นว่างไว้ใช้ 10%"
            controlWidthClass="sm:w-[140px]"
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={priceWarnPct}
                onChange={(e) => { setPriceWarnPct(e.target.value); setSaved(false); }}
                placeholder="10"
                className="w-20 rounded-control border border-card-border bg-white px-2 py-1.5 text-right text-body focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <span className="text-body text-ink-300">%</span>
            </div>
          </SettingRow>
        </SectionCard>

        <SaveBar
          tone={error ? "error" : saved ? "success" : isDirty ? "dirty" : "muted"}
          label={error || (saved ? "บันทึกแล้ว" : isDirty ? "ยังไม่ได้บันทึก" : "การตั้งค่าทั้งหมดถูกบันทึกแล้ว")}
          onSave={handleSave}
          saving={saving}
          onDiscard={isDirty && !saving ? hydrateFromProfile : undefined}
        />
      </div>
    </AppShell>
  );
}
