import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useToast } from "../../hooks/useToast";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Spinner } from "../../components/ui/Spinner";

export default function SetPasswordPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setLoading(false);
        return;
      }
      setUserId(session.user.id);

      supabase
        .from("client_profiles")
        .select("password_changed, company_name_th")
        .eq("user_id", session.user.id)
        .single()
        .then(({ data: cp }) => {
          if (cp && cp.password_changed === false) {
            // Owner with temp password — show set-password
            setLoading(false);
            return;
          }
          if (cp && cp.password_changed !== false) {
            navigate("/home", { replace: true });
            return;
          }
          // No client_profiles — check if staff member needs password change
          supabase
            .from("client_members")
            .select("password_changed")
            .eq("member_user_id", session.user.id)
            .eq("status", "active")
            .maybeSingle()
            .then(({ data: mb }) => {
              if (mb && mb.password_changed === false) {
                setIsStaff(true);
                setLoading(false);
              } else {
                navigate("/home", { replace: true });
              }
            });
        });
    });
  }, [navigate]);

  async function handleSetPassword(e: React.FormEvent) {
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

    if (userId) {
      if (isStaff) {
        await supabase
          .from("client_members")
          .update({ password_changed: true })
          .eq("member_user_id", userId)
          .eq("status", "active");
      } else {
        await supabase
          .from("client_profiles")
          .update({ password_changed: true })
          .eq("user_id", userId);
      }
    }

    toast.success("ตั้งรหัสผ่านเรียบร้อย");
    navigate("/home", { replace: true });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-page-bg flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold text-gray-800">ตั้งรหัสผ่านของคุณ</h1>
          <p className="text-sm text-gray-400 mt-1">
            เนื่องจากนี่คือการเข้าสู่ระบบครั้งแรก กรุณาตั้งรหัสผ่านใหม่ของคุณเอง
          </p>
        </div>
        <form onSubmit={handleSetPassword} className="bg-white border border-card-border rounded-card p-6 space-y-4">
          <Input
            id="password"
            label="รหัสผ่านใหม่"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoFocus
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
          <Button type="submit" className="w-full" loading={submitting} disabled={submitting}>
            {submitting ? "กำลังตั้งรหัสผ่าน..." : "ตั้งรหัสผ่าน"}
          </Button>
        </form>
      </div>
    </div>
  );
}
