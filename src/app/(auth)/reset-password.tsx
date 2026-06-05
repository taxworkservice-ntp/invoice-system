import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useToast } from "../../hooks/useToast";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Spinner } from "../../components/ui/Spinner";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setHasSession(true);
      }
      setLoading(false);
    });
  }, []);

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("รหัสผ่านไม่ตรงกัน");
      return;
    }

    if (password.length < 6) {
      setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      toast.error(updateError.message);
      setSubmitting(false);
      return;
    }

    await supabase.auth.signOut();
    toast.success("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว กรุณาเข้าสู่ระบบอีกครั้ง");
    navigate("/login", { replace: true });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-page-bg flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen bg-page-bg flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="bg-white border border-card-border rounded-card p-6 space-y-4">
            <h1 className="text-lg font-semibold text-gray-800">ลิงก์หมดอายุหรือไม่ถูกต้อง</h1>
            <p className="text-sm text-gray-400">
              ลิงก์รีเซ็ตรหัสผ่านหมดอายุแล้วหรือใช้ไม่ได้ กรุณาติดต่อผู้ดูแลระบบเพื่อขอรับลิงก์ใหม่
            </p>
            <Button className="w-full" onClick={() => navigate("/login", { replace: true })}>
              กลับไปหน้าเข้าสู่ระบบ
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold text-gray-800">ตั้งรหัสผ่านใหม่</h1>
          <p className="text-sm text-gray-400 mt-1">กรุณากรอกรหัสผ่านใหม่ของคุณ</p>
        </div>
        <form onSubmit={handleResetPassword} className="bg-white border border-card-border rounded-card p-6 space-y-4">
          <Input
            id="password"
            label="รหัสผ่านใหม่"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <Input
            id="confirm-password"
            label="ยืนยันรหัสผ่านใหม่"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "กำลังเปลี่ยนรหัสผ่าน..." : "เปลี่ยนรหัสผ่าน"}
          </Button>
        </form>
      </div>
    </div>
  );
}
