import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { AppShell } from "../../../components/layout/AppShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input, Select } from "../../../components/ui/Input";
import { LogoUpload } from "../../../components/ui/LogoUpload";
import { LOGO_SIZE_OPTIONS } from "../../../constants";
import { Spinner } from "../../../components/ui/Spinner";
import { useToast } from "../../../hooks/useToast";

const TABS = [
  { label: "โปรไฟล์", path: "/settings/profile" },
  { label: "ภาษี", path: "/settings/tax" },
  { label: "เลขที่เอกสาร", path: "/settings/numbering" },
  { label: "สต็อก", path: "/settings/stock" },
];

export default function SettingsProfilePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { clientProfile, loading, setClientProfile } = useClientProfile(profile?.id);

  const [companyNameTh, setCompanyNameTh] = useState("");
  const [companyNameEn, setCompanyNameEn] = useState("");
  const [taxId, setTaxId] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [logoKey, setLogoKey] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState("small");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (clientProfile) {
      setCompanyNameTh(clientProfile.company_name_th);
      setCompanyNameEn(clientProfile.company_name_en || "");
      setTaxId(clientProfile.tax_id || "");
      setAddress(clientProfile.address || "");
      setPhone(clientProfile.phone || "");
      setLogoKey(clientProfile.logo_url);
      setLogoSize((clientProfile as any).logo_size || "square");
    }
  }, [clientProfile]);

  async function handleSave() {
    if (!profile || !clientProfile) return;
    setSaving(true);
    setError("");
    setSuccess("");

    if (!companyNameTh.trim()) {
      setError("กรุณากรอกชื่อบริษัท (ภาษาไทย)");
      setSaving(false);
      return;
    }

    const { error: err } = await supabase
      .from("client_profiles")
      .update({
        company_name_th: companyNameTh,
        company_name_en: companyNameEn || null,
        tax_id: taxId || null,
        address: address || null,
        phone: phone || null,
        logo_url: logoKey,
        logo_size: logoSize,
      })
      .eq("user_id", profile.id);

    if (err) {
      setError(err.message);
      toast.error(err.message);
    } else {
      setSuccess("บันทึกสำเร็จ");
      toast.success("บันทึกโปรไฟล์สำเร็จ");
      setClientProfile({
        ...clientProfile,
        company_name_th: companyNameTh,
        company_name_en: companyNameEn || null,
        tax_id: taxId || null,
        address: address || null,
        phone: phone || null,
        logo_url: logoKey,
        logo_size: logoSize,
      });
    }
    setSaving(false);
  }

  if (loading) return <AppShell title="ตั้งค่า > โปรไฟล์"><Spinner /></AppShell>;

  return (
    <AppShell title="ตั้งค่า > โปรไฟล์">
      <div className="space-y-4">
        <div className="flex gap-1 border-b border-card-border pb-0">
          {TABS.map((tab) => (
            <Link
              key={tab.path}
              to={tab.path}
              className={`px-3 py-2 text-sm rounded-t-lg ${
                tab.path === "/settings/profile"
                  ? "bg-white border border-card-border border-b-white text-primary font-medium"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <Card>
          <div className="space-y-3">
            <Input
              label="ชื่อบริษัท (ภาษาไทย) *"
              value={companyNameTh}
              onChange={(e) => setCompanyNameTh(e.target.value)}
            />
            <Input
              label="ชื่อบริษัท (English)"
              value={companyNameEn}
              onChange={(e) => setCompanyNameEn(e.target.value)}
            />
            <Input
              label="เลขผู้เสียภาษี (13 หลัก)"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              maxLength={13}
            />
            <Input label="ที่อยู่" value={address} onChange={(e) => setAddress(e.target.value)} />
            <Input label="เบอร์โทร" value={phone} onChange={(e) => setPhone(e.target.value)} />

            {profile && (
              <LogoUpload userId={profile.id} currentLogoKey={logoKey} onLogoChange={setLogoKey} />
            )}

            {logoKey && (
              <Select
                label="ขนาดโลโก้บนเอกสาร"
                value={logoSize}
                onChange={(e) => setLogoSize(e.target.value)}
              >
                {LOGO_SIZE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label} ({opt.px}px)</option>
                ))}
              </Select>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}
            {success && <p className="text-xs text-green-500">{success}</p>}

            <Button onClick={handleSave} disabled={saving}>
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
