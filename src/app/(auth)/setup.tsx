import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Input";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../hooks/useToast";
import { OnboardingProgressDots } from "../../components/onboarding/OnboardingProgressDots";
import { VatChoiceCards } from "../../components/onboarding/VatChoiceCards";

const TOTAL_STEPS = 3;

export default function SetupPage() {
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [vatRegistered, setVatRegistered] = useState<boolean | null>(null);
  const [taxId, setTaxId] = useState("");

  const [itemType, setItemType] = useState<"product" | "service">("product");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemUnit, setItemUnit] = useState("ชิ้น");
  const [initialStock, setInitialStock] = useState("0");

  const [itemAdded, setItemAdded] = useState(false);
  const [savedItemName, setSavedItemName] = useState("");

  if (authLoading) return <Spinner />;
  if (!profile || profile.role !== "client") {
    navigate("/login", { replace: true });
    return null;
  }

  const userId = profile.id;

  async function handleSaveStep1() {
    setError("");
    setErrors({});

    if (!companyName.trim()) {
      setErrors({ companyName: "กรุณากรอกชื่อบริษัท" });
      return;
    }
    if (vatRegistered === null) {
      setErrors({ vat: "กรุณาเลือกสถานะ VAT" });
      return;
    }

    setSaving(true);

    async function doUpsert(payload: Record<string, unknown>) {
      return supabase.from("client_profiles").upsert(payload);
    }

    const basePayload: Record<string, unknown> = {
      user_id: userId,
      company_name_th: companyName.trim(),
      vat_registered: vatRegistered,
      tax_id: vatRegistered ? taxId : null,
      vat_rate: 7.0,
      default_wht_rate: "3",
      stock_deduct_trigger: "invoice",
    };

    let insertError;
    try {
      const result = await doUpsert({ ...basePayload, contact_name: contactName.trim() || null });
      insertError = result.error;
    } catch {
      const result = await doUpsert(basePayload);
      insertError = result.error;
    }

    if (insertError) {
      setError(insertError.message);
      toast.error(insertError.message);
      setSaving(false);
      return;
    }

    toast.success("บันทึกข้อมูลบริษัทแล้ว");
    setSaving(false);
    setStep(2);
  }

  async function handleSaveStep2() {
    if (!itemName.trim() || !itemPrice.trim()) {
      setErrors({ item: "กรุณากรอกชื่อและราคา" });
      return;
    }

    setSaving(true);
    setErrors({});

    const price = parseFloat(itemPrice);
    const stock = itemType === "product" ? parseInt(initialStock, 10) || 0 : 0;
    const openingValue = stock > 0 ? stock * price : 0;

    const { data: newItem, error: itemError } = await supabase
      .from("items")
      .insert({
        user_id: userId,
        name: itemName.trim(),
        item_type: itemType,
        unit_price: price,
        base_unit: itemUnit,
        stock_count: stock,
        avg_cost: stock > 0 ? price : 0,
        stock_value: openingValue,
      })
      .select("id")
      .single();

    if (itemError) {
      setError(itemError.message);
      toast.error(itemError.message);
      setSaving(false);
      return;
    }

    if (itemType === "product" && stock > 0 && newItem) {
      await supabase.from("stock_movements").insert({
        item_id: newItem.id,
        user_id: userId,
        movement_type: "manual_in",
        qty_base: stock,
        balance_after: stock,
        unit_cost: price,
        movement_value: openingValue,
        balance_value_after: openingValue,
        reason: "สต็อกเริ่มต้น",
      });
    }

    setSavedItemName(itemName.trim());
    setItemAdded(true);
    setSaving(false);
    setStep(3);
  }

  function handleSkipStep2() {
    setItemAdded(false);
    setStep(3);
  }

  function handleNavigateAndComplete(target: string) {
    navigate(target, { replace: true });
  }

  return (
    <div className="min-h-screen bg-[#F7F6F3] flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-[400px]">
          <OnboardingProgressDots currentStep={step} totalSteps={TOTAL_STEPS} />

          {step === 1 && (
            <div className="bg-white border border-[#E8E6DF] rounded-[10px] p-6 shadow-sm">
              <div className="text-center mb-5">
                <h2 className="text-[22px] font-bold text-[#1A1A18]">
                  เริ่มต้นใช้งาน
                </h2>
                <p className="text-[14px] text-[#888780] mt-1.5">
                  เริ่มต้นด้วยการตั้งค่าข้อมูลบริษัทของคุณ
                </p>
              </div>

              <div className="space-y-4">
                <Input
                  label="ชื่อบริษัท / ชื่อร้าน *"
                  value={companyName}
                  onChange={(e) => {
                    setCompanyName(e.target.value);
                    setErrors((prev) => ({ ...prev, companyName: "" }));
                  }}
                  placeholder="เช่น ร้านมาลี หรือ บริษัท สมชาย จำกัด"
                  className="text-[16px]"
                  autoFocus
                />
                {errors.companyName && (
                  <p className="text-xs text-red-500 -mt-3">{errors.companyName}</p>
                )}

                <Input
                  label="ชื่อผู้ติดต่อ"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="ชื่อคุณ (ใช้สำหรับทักทายในแอป)"
                />

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">
                    จดทะเบียน VAT หรือไม่ *
                  </label>
                  <VatChoiceCards value={vatRegistered} onChange={(val) => {
                    setVatRegistered(val);
                    setErrors((prev) => ({ ...prev, vat: "" }));
                  }} />
                  {errors.vat && (
                    <p className="text-xs text-red-500 mt-1">{errors.vat}</p>
                  )}
                </div>

                {vatRegistered === true && (
                  <div className="animate-slideDown">
                    <Input
                      label="เลขผู้เสียภาษี"
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 13))}
                      placeholder="0000000000000 (13 หลัก)"
                      maxLength={13}
                    />
                    <p className="text-[11px] text-[#888780] mt-1">
                      จำเป็นสำหรับการออกใบกำกับภาษีที่ถูกต้องตามกฎหมาย
                    </p>
                  </div>
                )}

                {error && <p className="text-xs text-red-500">{error}</p>}

                <Button
                  className="w-full text-[15px] font-semibold"
                  onClick={handleSaveStep1}
                  disabled={saving || !companyName.trim() || vatRegistered === null}
                >
                  {saving ? "กำลังบันทึก..." : "ถัดไป →"}
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="bg-white border border-[#E8E6DF] rounded-[10px] p-6 shadow-sm">
              <div className="flex items-start mb-5">
                <button
                  onClick={() => setStep(1)}
                  className="text-[13px] text-[#378ADD] hover:underline shrink-0 mr-3"
                >
                  ← ย้อนกลับ
                </button>
                <div className="text-center flex-1">
                  <h2 className="text-[20px] font-bold text-[#1A1A18]">
                    เพิ่มสินค้าหรือบริการชิ้นแรก
                  </h2>
                  <p className="text-[13px] text-[#888780] mt-1">
                    คุณสามารถเพิ่มเพิ่มเติมได้ภายหลัง
                  </p>
                </div>
                <div className="w-16 shrink-0" />
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">
                    ประเภท
                  </label>
                  <div className="flex bg-[#F7F6F3] rounded-lg p-0.5">
                    {(["product", "service"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setItemType(t)}
                        className={`flex-1 py-2 text-sm rounded-md text-center transition-colors ${
                          itemType === t
                            ? "bg-white shadow-sm text-[#1A1A18] font-medium"
                            : "text-[#888780]"
                        }`}
                      >
                        {t === "product" ? "🛍 สินค้า" : "⚙ บริการ"}
                      </button>
                    ))}
                  </div>
                </div>

                <Input
                  label="ชื่อ *"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="เช่น กระดาษ A4, ออกแบบโลโก้..."
                />

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">
                    ราคา * ต่อ
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#888780]">
                        ฿
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={itemPrice}
                        onChange={(e) => setItemPrice(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-8 pr-3 py-2 text-sm border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20"
                      />
                    </div>
                    <Select value={itemUnit} onChange={(e) => setItemUnit(e.target.value)}>
                      <option value="ชิ้น">ชิ้น</option>
                      <option value="อัน">อัน</option>
                      <option value="กล่อง">กล่อง</option>
                      <option value="ชุด">ชุด</option>
                      <option value="ครั้ง">ครั้ง</option>
                      <option value="ชั่วโมง">ชั่วโมง</option>
                      <option value="วัน">วัน</option>
                      <option value="เดือน">เดือน</option>
                      <option value="kg">kg</option>
                      <option value="m">m</option>
                    </Select>
                  </div>
                </div>

                {itemType === "product" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">
                      สต็อกเริ่มต้น
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={initialStock}
                        onChange={(e) => setInitialStock(e.target.value)}
                        className="w-24 px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20"
                      />
                      <span className="text-sm text-[#888780]">ชิ้น</span>
                    </div>
                  </div>
                )}

                {errors.item && (
                  <p className="text-xs text-red-500">{errors.item}</p>
                )}
                {error && <p className="text-xs text-red-500">{error}</p>}

                <Button
                  className="w-full"
                  onClick={handleSaveStep2}
                  disabled={saving || !itemName.trim() || !itemPrice.trim()}
                >
                  {saving ? "กำลังบันทึก..." : "เพิ่มสินค้า / บริการ"}
                </Button>

                <button
                  onClick={handleSkipStep2}
                  className="w-full text-sm text-[#888780] hover:text-[#1A1A18] py-2"
                >
                  ข้ามขั้นตอนนี้ →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="bg-white border border-[#E8E6DF] rounded-[10px] p-6 shadow-sm">
              <div className="text-center mb-6">
                <h2 className="text-[24px] font-bold text-[#1A1A18]">
                  ตั้งค่าเริ่มต้นเรียบร้อยแล้ว
                </h2>
              </div>

              <div className="bg-[#F7F6F3] rounded-lg p-4 mb-6 space-y-1">
                <p className="text-[14px] text-[#27500A]">
                  ข้อมูลบริษัท: {companyName}
                </p>
                <p className="text-[14px] text-[#27500A]">
                  VAT: {vatRegistered ? "จดทะเบียน" : "ไม่ได้จด"}
                </p>
                {itemAdded && (
                  <p className="text-[14px] text-[#27500A]">
                    สินค้า: {savedItemName}
                  </p>
                )}
              </div>

              <div className="space-y-2 mb-4">
                {([
                  { icon: "01", title: "เริ่มงานขายแรก", desc: "เริ่มออกใบเสนอราคาหรือใบแจ้งหนี้", to: "/deals/new" },
                  { icon: "02", title: "เพิ่มลูกค้าก่อน", desc: "บันทึกข้อมูลลูกค้าที่คุณทำงานด้วย", to: "/customers" },
                  { icon: "03", title: "ตั้งค่าเพิ่มเติม", desc: "แก้ไขที่อยู่, prefix เอกสาร, และอื่นๆ", to: "/settings" },
                ] as const).map((opt) => (
                  <div
                    key={opt.to}
                    onClick={() => handleNavigateAndComplete(opt.to)}
                    className="flex items-center gap-3 bg-white border border-[#E8E6DF] rounded-[10px] px-4 py-3.5 cursor-pointer hover:shadow-sm hover:border-gray-300 transition-all active:translate-y-[1px]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F7F6F3] text-xs font-semibold text-[#888780]">{opt.icon}</span>
                    <div>
                      <div className="text-[14px] font-medium text-[#1A1A18]">
                        {opt.title}
                      </div>
                      <div className="text-[12px] text-[#888780]">{opt.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => handleNavigateAndComplete("/home")}
                className="w-full text-[#378ADD] text-sm font-medium py-2 hover:underline"
              >
                เข้าสู่หน้าหลัก →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
