import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createAdminClient } from "../../../lib/adminApi";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { useToast } from "../../../hooks/useToast";

export default function AdminClientNewPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");

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
      });

      toast.success(`สร้างบัญชีและส่งอีเมลเชิญไปที่ ${result.email}`);
      navigate(`/admin/clients/${result.userId}`, { replace: true });
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
      return;
    }
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
              <p className="text-[11px] text-[#888780] -mt-3">
                ลูกค้าจะได้รับอีเมลสำหรับตั้งรหัสผ่าน
              </p>

              <Input
                label="ชื่อบริษัท (เบื้องต้น)"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="ชื่อบริษัทหรือชื่อร้าน"
              />

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

              <Button type="submit" className="w-full" disabled={creating}>
                {creating
                  ? "กำลังสร้างบัญชี..."
                  : "สร้างบัญชีและส่งอีเมลเชิญ"}
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </div>
  );
}
