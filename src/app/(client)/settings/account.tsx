import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../hooks/useAuth";
import { AppShell } from "../../../components/layout/AppShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";

const TABS = [
  { label: "โปรไฟล์", path: "/settings/profile" },
  { label: "ภาษี", path: "/settings/tax" },
  { label: "เลขที่เอกสาร", path: "/settings/numbering" },
  { label: "สต็อก", path: "/settings/stock" },
  { label: "บัญชี", path: "/settings/account" },
];

export default function SettingsAccountPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [email, setEmail] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setEmail(data.user.email);
    });
  }, []);

  async function handleChangePassword() {
    setChangingPassword(true);
    setPasswordError("");
    setPasswordSaved(false);

    if (!currentPassword) {
      setPasswordError("กรุณากรอกรหัสผ่านปัจจุบัน");
      setChangingPassword(false);
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setPasswordError("รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร");
      setChangingPassword(false);
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordError("รหัสผ่านใหม่ไม่ตรงกัน");
      setChangingPassword(false);
      return;
    }

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (signInErr) {
      setPasswordError("รหัสผ่านปัจจุบันไม่ถูกต้อง");
      setChangingPassword(false);
      return;
    }

    const { error: updateErr } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (updateErr) {
      setPasswordError(updateErr.message);
    } else {
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setPasswordSaved(true);
    }
    setChangingPassword(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <AppShell title="ตั้งค่า > บัญชี">
      <div className="space-y-4">
        <div className="flex gap-1 border-b border-card-border pb-0">
          {TABS.map((tab) => (
            <Link
              key={tab.path}
              to={tab.path}
              className={`px-3 py-2 text-sm rounded-t-lg ${
                tab.path === "/settings/account"
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
            <div>
              <p className="text-[12px] text-[#888780]">อีเมล</p>
              <p className="text-[13px] text-[#1A1A18]">{email}</p>
            </div>

            <div className="border-t border-[#E8E6DF] pt-3">
              <Input
                label="รหัสผ่านปัจจุบัน"
                type="password"
                value={currentPassword}
                onChange={(e) => { setCurrentPassword(e.target.value); setPasswordSaved(false); }}
                placeholder="รหัสผ่านปัจจุบัน"
              />
              <Input
                label="รหัสผ่านใหม่"
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordSaved(false); }}
                placeholder="รหัสผ่านอย่างน้อย 6 ตัวอักษร"
              />
              <Input
                label="ยืนยันรหัสผ่านใหม่"
                type="password"
                value={newPasswordConfirm}
                onChange={(e) => { setNewPasswordConfirm(e.target.value); setPasswordSaved(false); }}
                placeholder="ใส่รหัสผ่านอีกครั้ง"
              />

              {passwordError && <p className="text-xs text-red-500">{passwordError}</p>}
              {passwordSaved && <p className="text-xs text-green-600">เปลี่ยนรหัสผ่านเรียบร้อยแล้ว</p>}

              <Button onClick={handleChangePassword} disabled={changingPassword} className="w-full">
                {changingPassword ? "กำลังเปลี่ยน..." : "เปลี่ยนรหัสผ่าน"}
              </Button>
            </div>

            <button
              onClick={() => {
                if (window.confirm("ออกจากระบบ?")) handleLogout();
              }}
              className="text-red-500 text-[13px] font-medium hover:underline"
            >
              ออกจากระบบ
            </button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
