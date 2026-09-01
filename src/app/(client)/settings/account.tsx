import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../hooks/useAuth";
import { AppShell } from "../../../components/layout/AppShell";
import { SectionCard } from "../../../components/ui/SectionCard";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { SettingsTabs } from "./_components/SettingsTabs";

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
        <SettingsTabs activePath="/settings/account" />

        <SectionCard title="บัญชีผู้ใช้" description="อีเมลเข้าใช้งานและรหัสผ่าน">
          <div className="space-y-4">
            <div>
              <p className="text-[12px] text-[#888780]">อีเมล</p>
              <p className="text-[13px] text-[#1A1A18]">{email}</p>
            </div>

            <div className="border-t border-[#F0EEE8] pt-4">
              <p className="text-xs font-medium text-gray-700 mb-2">เปลี่ยนรหัสผ่าน</p>
              <div className="space-y-3 max-w-sm">
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
              </div>

              {passwordError && <p className="mt-3 text-xs text-red-500">{passwordError}</p>}
              {passwordSaved && <p className="mt-3 text-xs text-green-600">เปลี่ยนรหัสผ่านเรียบร้อยแล้ว</p>}

              <Button onClick={handleChangePassword} disabled={changingPassword} className="mt-4">
                {changingPassword ? "กำลังเปลี่ยน..." : "เปลี่ยนรหัสผ่าน"}
              </Button>
            </div>

            <div className="border-t border-[#F0EEE8] pt-4">
              <button
                onClick={() => {
                  if (window.confirm("ออกจากระบบ?")) handleLogout();
                }}
                className="text-red-500 text-[13px] font-medium hover:underline"
              >
                ออกจากระบบ
              </button>
            </div>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
