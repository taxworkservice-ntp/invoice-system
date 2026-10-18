import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useToast } from "../../hooks/useToast";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";

export default function LoginPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Test-workspace hint — localhost only, never shown on deployed builds.
  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      toast.error(authError.message);
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    if (profile?.role === "admin") {
      navigate("/admin/clients", { replace: true });
    } else {
      const { data: cp } = await supabase
        .from("client_profiles")
        .select("id, password_changed")
        .eq("user_id", data.user.id)
        .single();

      if (cp && cp.password_changed === false) {
        navigate("/set-password", { replace: true });
      } else if (cp) {
        navigate("/home", { replace: true });
      } else {
        const { data: membership } = await supabase
          .from("client_members")
          .select("workspace_user_id, password_changed")
          .eq("member_user_id", data.user.id)
          .eq("status", "active")
          .maybeSingle();
        if (membership && membership.password_changed === false) {
          navigate("/set-password", { replace: true });
        } else {
          navigate(membership ? "/home" : "/setup", { replace: true });
        }
      }
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-page-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-display font-semibold text-ink-800">Invoice System</h1>
          <p className="text-body text-ink-400 mt-1">เข้าสู่ระบบ</p>
        </div>
        <form
          onSubmit={handleLogin}
          className="bg-white border border-card-border rounded-card p-6 space-y-4"
        >
          <Input
            id="email"
            label="อีเมล"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            id="password"
            label="รหัสผ่าน"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-label text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </Button>
        </form>
        {isLocalhost && (
          <div className="mt-4 rounded-control border border-dashed border-card-border bg-paper-soft/60 px-3 py-2.5 text-label leading-5 text-ink-500">
            <p className="font-medium text-ink-600">ทดสอบบน localhost</p>
            <p className="mt-0.5">
              อีเมล <span className="font-mono text-ink-800">testcompany@gmail.com</span>
              <br />
              รหัสผ่าน <span className="font-mono text-ink-800">test1234</span>
            </p>
            <button
              type="button"
              onClick={() => {
                setEmail("testcompany@gmail.com");
                setPassword("test1234");
              }}
              className="mt-1.5 font-medium text-primary-deep hover:underline"
            >
              กรอกอัตโนมัติ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
