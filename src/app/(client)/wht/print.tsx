import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import type { WhtRecord, WhtVendor, ClientProfile } from "../../../types";

const PAGE_W = 1512;
const PAGE_H = 2138;
const BG_IMAGE = "/wht/form_page1.png";

const FONT_FAMILY = "'Sarabun', 'Noto Sans Thai', 'Cordia New', sans-serif";

interface FieldBox {
  top: number;
  left: number;
  width: number;
  height: number;
  fontSize: number;
  align: "left" | "right" | "center";
  bold?: boolean;
}

interface FieldDef {
  box: FieldBox;
  value: string;
}

interface ImageOverlay {
  name: string;
  src: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

const CHECKMARK_POS: Record<string, { top: number; left: number; fs: number }> = {
  pnd1:         { top: 605, left: 535, fs: 32 },
  pnd1_special: { top: 605, left: 733, fs: 32 },
  pnd2:         { top: 605, left: 1007, fs: 32 },
  pnd3:         { top: 605, left: 1203, fs: 32 },
  pnd2a:        { top: 657, left: 535, fs: 32 },
  pnd3a:        { top: 657, left: 733, fs: 32 },
  pnd53:        { top: 657, left: 1007, fs: 32 },
};

function fmtDate(iso: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch { return iso || ""; }
}

function fmtNum(n: number | null | undefined) {
  if (n == null || n === 0) return "";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function splitTaxid(s: string | null | undefined) {
  const digits = String(s || "").replace(/\D/g, "").slice(0, 13).padEnd(13, " ");
  return `${digits[0]}   ${digits.slice(1, 5)}     ${digits.slice(5, 10)}     ${digits.slice(10, 12)}   ${digits[12]}`;
}

function thaiBahtText(num: number | null | undefined) {
  if (num == null) return "";
  const n = Math.floor(num);
  if (n === 0) return "ศูนย์บาทถ้วน";
  const digits = "ศูนย์,หนึ่ง,สอง,สาม,สี่,ห้า,หก,เจ็ด,แปด,เก้า".split(",");
  const units = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];
  const parts: string[] = [];
  let remaining = n;
  let pos = 0;
  while (remaining > 0) {
    const d = remaining % 10;
    remaining = Math.floor(remaining / 10);
    if (d === 0) { pos++; continue; }
    const unit = units[pos] || "";
    let word: string;
    if (pos === 0 && d === 1 && parts.length > 0) word = "เอ็ด";
    else if (pos === 1 && d === 2) word = "ยี่" + unit;
    else if (pos === 1 && d === 1) word = unit;
    else word = digits[d] + unit;
    parts.push(word);
    pos++;
  }
  return parts.reverse().join("") + "บาทถ้วน";
}

interface RecordWithVendor extends WhtRecord {
  vendor?: WhtVendor;
}

function buildFields(record: RecordWithVendor, profile: ClientProfile, seq: number): FieldDef[] {
  const v = record.vendor;
  const month = record.issue_date ? new Date(record.issue_date).getMonth() + 1 : 1;
  const whtId = month ? `68${String(month).padStart(2, "0")}${String(seq + 100).padStart(3, "0")}` : "";
  const dateStr = fmtDate(record.issue_date);
  const amtStr = fmtNum(record.amount);
  const whtStr = fmtNum(record.wht_amount);
  const thaiStr = thaiBahtText(record.wht_amount);

  return [
    {
      box: { top: 152, left: 1270, width: 200, height: 40, fontSize: 35, align: "center" },
      value: whtId,
    },
    {
      box: { top: 248, left: 150, width: 650, height: 38, fontSize: 33, align: "left" },
      value: profile.company_name_th || "",
    },
    {
      box: { top: 205, left: 950, width: 400, height: 48, fontSize: 45, align: "left", bold: true },
      value: splitTaxid(profile.tax_id),
    },
    {
      box: { top: 308, left: 150, width: 650, height: 68, fontSize: 32, align: "left" },
      value: profile.address || "",
    },
    {
      box: { top: 432, left: 150, width: 650, height: 38, fontSize: 33, align: "left" },
      value: String(v?.name || ""),
    },
    {
      box: { top: 380, left: 950, width: 400, height: 48, fontSize: 45, align: "left", bold: true },
      value: splitTaxid(v?.tax_id),
    },
    {
      box: { top: 502, left: 150, width: 650, height: 68, fontSize: 32, align: "left" },
      value: String(v?.address || ""),
    },
    {
      box: { top: 1548, left: 700, width: 180, height: 40, fontSize: 35, align: "center" },
      value: dateStr,
    },
    {
      box: { top: 1548, left: 910, width: 270, height: 40, fontSize: 35, align: "right" },
      value: amtStr,
    },
    {
      box: { top: 1548, left: 1180, width: 200, height: 40, fontSize: 35, align: "right" },
      value: whtStr,
    },
    {
      box: { top: 1645, left: 910, width: 270, height: 40, fontSize: 35, align: "right" },
      value: amtStr,
    },
    {
      box: { top: 1645, left: 1180, width: 200, height: 40, fontSize: 35, align: "right" },
      value: whtStr,
    },
    {
      box: { top: 1690, left: 490, width: 680, height: 42, fontSize: 36, align: "left" },
      value: thaiStr,
    },
    {
      box: { top: 1910, left: 815, width: 180, height: 40, fontSize: 35, align: "center" },
      value: dateStr,
    },
  ];
}

function buildImages(profile: ClientProfile): ImageOverlay[] {
  const images: ImageOverlay[] = [];
  if (profile.signature_url) {
    images.push({ name: "signature", src: profile.signature_url, top: 1865, left: 950, width: 240, height: 90 });
  }
  if (profile.stamp_url) {
    images.push({ name: "logo", src: profile.stamp_url, top: 1870, left: 1265, width: 110, height: 110 });
  }
  return images;
}

function PndPage({
  record,
  profile,
  seq,
}: {
  record: RecordWithVendor;
  profile: ClientProfile;
  seq: number;
}) {
  const fields = buildFields(record, profile, seq);
  const images = buildImages(profile);
  const checkmark = CHECKMARK_POS[record.form_type];

  return (
    <div
      className="print-sheet"
      style={{
        width: PAGE_W + "px",
        height: PAGE_H + "px",
        position: "relative",
        overflow: "hidden",
        fontFamily: FONT_FAMILY,
      }}
    >
      <img
        className="bg"
        src={BG_IMAGE}
        alt="form background"
        style={{ position: "absolute", inset: 0, width: PAGE_W + "px", height: PAGE_H + "px" }}
      />

      {images.map((img) => (
        <img
          key={img.name}
          alt={img.name}
          src={img.src}
          crossOrigin="anonymous"
          style={{
            position: "absolute",
            top: img.top + "px",
            left: img.left + "px",
            width: img.width + "px",
            height: img.height + "px",
            objectFit: "contain",
            objectPosition: "center center",
          }}
        />
      ))}

      {checkmark && (
        <div
          aria-label={record.form_type}
          style={{
            position: "absolute",
            top: checkmark.top - checkmark.fs + 3 + "px",
            left: checkmark.left + "px",
            fontSize: checkmark.fs + "px",
            lineHeight: 1,
            fontFamily: "'Segoe UI Symbol','Arial',sans-serif",
            color: "#000",
          }}
        >
          {"\u2713"}
        </div>
      )}

      {fields.map((f, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: f.box.top + "px",
            left: f.box.left + "px",
            width: f.box.width + "px",
            height: f.box.height + "px",
            display: "flex",
            alignItems: "center",
            justifyContent:
              f.box.align === "right" ? "flex-end" : f.box.align === "center" ? "center" : "flex-start",
            fontSize: f.box.fontSize + "px",
            fontWeight: f.box.bold ? 700 : 400,
            lineHeight: 1.2,
            color: "#000",
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "clip",
          }}
        >
          {f.value}
        </div>
      ))}
    </div>
  );
}

function CleanPage({
  record,
  profile,
}: {
  record: RecordWithVendor;
  profile: ClientProfile;
}) {
  return (
    <div
      className="print-sheet"
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "10mm",
        boxSizing: "border-box",
        fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif",
        backgroundColor: "#fff",
        position: "relative",
      }}
    >
      <div style={{ marginBottom: "6mm" }}>
        <div style={{ fontSize: "14px", fontWeight: 700, textAlign: "center", marginBottom: "2mm" }}>
          หนังสือรับรองการหักภาษี ณ ที่จ่าย
        </div>
        <div style={{ fontSize: "12px", textAlign: "center", marginBottom: "4mm" }}>
          ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3mm" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "10px", color: "#666", marginBottom: "1mm" }}>ผู้จ่ายเงิน (Payer)</div>
            <div style={{ fontSize: "13px", fontWeight: 600 }}>{profile.company_name_th || "-"}</div>
            <div style={{ fontSize: "10px", color: "#666" }}>เลขประจำตัวผู้เสียภาษี: {splitTaxid(profile.tax_id)}</div>
            <div style={{ fontSize: "10px", color: "#666" }}>{profile.address || ""}</div>
          </div>
          <div style={{ width: "40mm", textAlign: "right" }}>
            <div style={{ fontSize: "10px", color: "#666", marginBottom: "1mm" }}>เลขที่ใบรับรอง</div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#378ADD" }}>{record.certificate_no || "-"}</div>
            <div style={{
              display: "inline-block", marginTop: "2mm", padding: "1mm 3mm", borderRadius: "2mm",
              backgroundColor: "#EEF2FF", color: "#4338CA", fontSize: "10px", fontWeight: 600,
            }}>
              {record.form_type.toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid #ddd", marginBottom: "4mm" }} />

      <div style={{ marginBottom: "3mm" }}>
        <div style={{ fontSize: "10px", color: "#666", marginBottom: "1mm" }}>ผู้ถูกหักภาษี ณ ที่จ่าย (Payee)</div>
        <div style={{ fontSize: "13px", fontWeight: 600 }}>{record.vendor?.name || "-"}</div>
        <div style={{ fontSize: "10px", color: "#666" }}>เลขประจำตัวผู้เสียภาษี: {splitTaxid(record.vendor?.tax_id)}</div>
        <div style={{ fontSize: "10px", color: "#666" }}>{record.vendor?.address || ""}</div>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid #ddd", marginBottom: "4mm" }} />

      <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ backgroundColor: "#F7F6F3" }}>
            <th style={{ padding: "1.5mm 3mm", textAlign: "left", fontSize: "10px", color: "#666", fontWeight: 500 }}>วันที่จ่าย</th>
            <th style={{ padding: "1.5mm 3mm", textAlign: "right", fontSize: "10px", color: "#666", fontWeight: 500 }}>จำนวนเงิน</th>
            <th style={{ padding: "1.5mm 3mm", textAlign: "center", fontSize: "10px", color: "#666", fontWeight: 500 }}>อัตรา</th>
            <th style={{ padding: "1.5mm 3mm", textAlign: "right", fontSize: "10px", color: "#666", fontWeight: 500 }}>ภาษีหัก</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: "2mm 3mm" }}>{fmtDate(record.issue_date)}</td>
            <td style={{ padding: "2mm 3mm", textAlign: "right" }}>{fmtNum(record.amount)}</td>
            <td style={{ padding: "2mm 3mm", textAlign: "center" }}>{record.wht_rate}%</td>
            <td style={{ padding: "2mm 3mm", textAlign: "right", color: "#C0392B", fontWeight: 600 }}>{fmtNum(record.wht_amount)}</td>
          </tr>
          <tr style={{ borderTop: "1px solid #E8E6DF" }}>
            <td colSpan={4} style={{ padding: "2mm 3mm" }}>
              <span style={{ fontSize: "10px", color: "#666" }}>จำนวนเงินที่หัก (ตัวอักษร): </span>
              <span style={{ fontSize: "11px" }}>{thaiBahtText(record.wht_amount)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      {record.note && (
        <div style={{ marginTop: "3mm", fontSize: "9px", color: "#888", fontStyle: "italic" }}>
          หมายเหตุ: {record.note}
        </div>
      )}

      <div style={{ marginTop: "8mm", display: "flex", justifyContent: "flex-end", alignItems: "flex-end" }}>
        <div style={{ textAlign: "center" }}>
          {profile.signature_url && (
            <img src={profile.signature_url} alt="signature" style={{ maxWidth: "40mm", maxHeight: "15mm", objectFit: "contain", marginBottom: "1mm" }} crossOrigin="anonymous" />
          )}
          <div style={{ fontSize: "10px", color: "#666", marginTop: "1mm" }}>___________________________</div>
          <div style={{ fontSize: "11px" }}>{profile.company_name_th || "ผู้จ่ายเงิน"}</div>
          <div style={{ fontSize: "9px", color: "#888" }}>ผู้จ่ายเงิน / ผู้มีอำนาจลงนาม</div>
          <div style={{ fontSize: "10px", color: "#666" }}>วันที่ .......... / .......... / ..........</div>
        </div>
      </div>
    </div>
  );
}

export default function WhtPrintPage() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [records, setRecords] = useState<RecordWithVendor[]>([]);
  const [profile, setProfile] = useState<ClientProfile | null>(null);

  const idsRaw = searchParams.get("ids") || "";
  const ids = idsRaw.split(",").filter(Boolean);
  const layout = searchParams.get("layout") || "clean";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const { data: recordData, error: recordError } = await supabase
          .from("wht_records")
          .select("*, vendor:wht_vendors(*)")
          .in("id", ids);

        if (recordError) throw new Error(recordError.message);
        if (!recordData || recordData.length === 0) throw new Error("No WHT records found");

        if (cancelled) return;
        setRecords(recordData as any);

        const userId = (recordData[0] as any).user_id;

        const { data: profileData, error: profileError } = await supabase
          .from("client_profiles")
          .select("*")
          .eq("user_id", userId)
          .single();

        if (profileError) throw new Error(profileError.message);
        if (cancelled) return;
        setProfile(profileData as ClientProfile);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (ids.length > 0) load();
    else {
      setLoading(false);
      setError("No record IDs provided");
    }
  }, [idsRaw]);

  if (loading) {
    return (
      <div style={{ width: PAGE_W + "px", minHeight: PAGE_H + "px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ width: PAGE_W + "px", minHeight: PAGE_H + "px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  if (layout === "pnd" && profile) {
    return (
      <div>
        <style>{`
          @font-face {
            font-family: Sarabun;
            src: url('/fonts/Sarabun-Regular.ttf') format('truetype');
            font-weight: 400;
          }
          @font-face {
            font-family: Sarabun;
            src: url('/fonts/Sarabun-SemiBold.ttf') format('truetype');
            font-weight: 600;
          }
          @font-face {
            font-family: Sarabun;
            src: url('/fonts/Sarabun-Bold.ttf') format('truetype');
            font-weight: 700;
          }
          @page { margin: 0; size: ${PAGE_W}px ${PAGE_H}px; }
          body { margin: 0; }
        `}</style>
        {records.map((r, idx) => (
          <PndPage key={r.id} record={r} profile={profile} seq={idx} />
        ))}
      </div>
    );
  }

  return (
    <div>
      {profile && records.map((r) => (
        <CleanPage key={r.id} record={r} profile={profile} />
      ))}
    </div>
  );
}
