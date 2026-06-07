import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createAdminClient } from "../../../lib/adminApi";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { useToast } from "../../../hooks/useToast";
import { Copy, RefreshCw } from "lucide-react";

function generatePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function AdminClientNewPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [createdResult, setCreatedResult] = useState<{ userId: string; email: string; tempPassword?: string } | null>(null);

  function handleGeneratePassword() {
    setTempPassword(generatePassword());
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEmailError("");

    if (!email.trim()) {
      setEmailError("กรุณากรอกอีเมล");
      return;
    }

    setCreating(true);

    try {
      const result = await createAdminClient({
        email: email.trim(),
        companyName: companyName.trim(),
        adminNote: adminNote.trim(),
        password: tempPassword || undefined,
      });

      setCreatedResult(result);

      if (result.tempPassword) {
        toast.success("สร้างบัญชีเรียบร้อย");
      } else {
        toast.success(`สร้างบัญชีและส่งอีเมลเชิญไปที่ ${result.email}`);
      }
    } catch (e: any) {
      if (
        e.message?.includes("already been registered") ||
        e.message?.includes("already exists")
      ) {
        setEmailError("อีเมลนี้ถูกใช้สร้างบัญชีแล้ว");
      } else {
        setError(e.message || "เกิดข้อผิดพลาดในการสร้างลูกค้า");
      }
      setCreating(false);
    }
  }

  if (createdResult) {
    return (
      <div className="min-h-screen bg-[#F7F6F3]">
        <header className="sticky top-0 z-30 border-b border-[#E8E6DF] bg-white/90 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 h-14 max-w-4xl mx-auto">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate("/admin/clients")}
                className="text-gray-500 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100"
              >
                <span className="text-sm">← ลูกค้า</span>
              </button>
              <h1 className="text-sm font-semibold text-gray-800">
                สร้างบัญชีสำเร็จ
              </h1>
            </div>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <Card>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#888780] uppercase tracking-wide">อีเมล</span>
              </div>
              <p className="text-sm font-medium">{createdResult.email}</p>
            </div>
          </Card>

          {createdResult.tempPassword && (
            <Card>
              <div className="space-y-3">
                <p className="text-xs text-[#888780] uppercase tracking-wide">รหัสผ่านชั่วคราว</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg border border-[#E8E6DF] bg-[#FBFBF9] px-3 py-2 text-lg font-mono tracking-wider select-all">
                    {createdResult.tempPassword}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(createdResult.tempPassword!);
                      toast.success("คัดลอกรหัสผ่านแล้ว");
                    }}
                  >
                    <Copy size={14} />
                  </Button>
                </div>
                <p className="text-xs text-amber-700">
                  กรุณาบันทึกรหัสผ่านนี้ — ลูกค้าจะต้องใช้รหัสผ่านนี้เพื่อเข้าสู่ระบบครั้งแรก
                  เมื่อเข้าสู่ระบบแล้ว ระบบจะบังคับให้ลูกค้าตั้งรหัสผ่านใหม่
                </p>
              </div>
            </Card>
          )}

          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setCreatedResult(null);
                setEmail("");
                setCompanyName("");
                setAdminNote("");
                setTempPassword("");
                setCreating(false);
              }}
            >
              สร้างบัญชีใหม่
            </Button>
            <Button
              className="flex-1"
              onClick={() => navigate(`/admin/clients/${createdResult.userId}`, { replace: true })}
            >
              ดูรายละเอียดลูกค้า
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      <header className="sticky top-0 z-30 border-b border-[#E8E6DF] bg-white/90 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 h-14 max-w-4xl mx-auto">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/admin/clients")}
              className="text-gray-500 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100"
            >
              <span className="text-sm">← ลูกค้า</span>
            </button>
            <h1 className="text-sm font-semibold text-gray-800">
              เพิ่มลูกค้าใหม่
            </h1>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <form onSubmit={handleCreate}>
          <Card>
            <div className="space-y-4">
              <Input
                label="อีเมล *"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError("");
                }}
                placeholder="name@company.com"
                error={emailError}
                autoFocus
              />

              <Input
                label="ชื่อบริษัท (เบื้องต้น)"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="ชื่อบริษัทหรือชื่อร้าน"
              />

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  รหัสผ่านชั่วคราว
                </label>
                <div className="flex gap-2">
                  <Input
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    placeholder="เว้นว่างเพื่อส่งอีเมลเชิญ"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleGeneratePassword}
                    title="สุ่มรหัสผ่าน"
                  >
                    <RefreshCw size={14} />
                  </Button>
                </div>
                <p className="text-[11px] text-[#888780] mt-1">
                  {tempPassword
                    ? "ลูกค้าจะเข้าสู่ระบบด้วยรหัสนี้และต้องเปลี่ยนรหัสผ่านทันที"
                    : "ถ้าไม่กรอก ระบบจะส่งอีเมลเชิญเพื่อให้ลูกค้าตั้งรหัสผ่านเอง"}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  หมายเหตุสำหรับ admin
                </label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="บันทึกข้อมูลเพิ่มเติมสำหรับทีม admin"
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20 placeholder:text-gray-400 resize-none"
                />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <Button type="submit" className="w-full" loading={creating} disabled={creating}>
                {tempPassword ? "สร้างบัญชี" : "สร้างบัญชีและส่งอีเมลเชิญ"}
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </div>
  );
}
