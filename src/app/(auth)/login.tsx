import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useToast } from "../../hooks/useToast";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const toast = useToast();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      const hash = window.location.hash;
      if (hash.includes("type=recovery")) {
        navigate("/reset-password", { replace: true });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        navigate("/reset-password", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

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
        navigate("/setup", { replace: true });
      }
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-page-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold text-gray-800">Invoice System</h1>
          <p className="text-sm text-gray-400 mt-1">เข้าสู่ระบบ</p>
        </div>
        <form onSubmit={handleLogin} className="bg-white border border-card-border rounded-card p-6 space-y-4">
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
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </Button>
        </form>
      </div>
    </div>
  );
}
