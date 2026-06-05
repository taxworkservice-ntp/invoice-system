import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { listAdminClientUsers } from "../../lib/adminApi";
import { useAuth } from "../../hooks/useAuth";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Spinner } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { formatBuddhistDate } from "../../lib/dates";
import { Search, UserPlus, AlertTriangle } from "lucide-react";

interface ClientRow {
  user_id: string;
  company_name_th: string | null;
  company_name_en: string | null;
  email: string;
  created_at: string;
  is_active: boolean;
  doc_count: number;
  customer_count: number;
}

export default function AdminClientsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchClients();
  }, []);

  async function fetchClients() {
    setLoading(true);
    setError("");

    const { data: profiles, error: cpErr } = await supabase
      .from("client_profiles")
      .select("user_id, company_name_th, company_name_en, created_at")
      .order("created_at", { ascending: false });

    if (cpErr) {
      setError(cpErr.message);
      setLoading(false);
      return;
    }

    if (!profiles || profiles.length === 0) {
      setClients([]);
      setLoading(false);
      return;
    }

    let usersList: Array<{ id: string; email: string; isActive: boolean }> = [];
    try {
      usersList = await listAdminClientUsers();
    } catch {}

    const userMap = new Map<string, { email: string; isActive: boolean }>();
    for (const u of usersList) {
      userMap.set(u.id, { email: u.email || "", isActive: u.isActive });
    }

    const rows: ClientRow[] = await Promise.all(
      (profiles || []).map(async (cp: any) => {
        const user = userMap.get(cp.user_id);

        const [{ count: docCount }, { count: custCount }] = await Promise.all([
          supabase
            .from("documents")
            .select("*", { count: "exact", head: true })
            .eq("user_id", cp.user_id),
          supabase
            .from("customers")
            .select("*", { count: "exact", head: true })
            .eq("user_id", cp.user_id)
            .eq("is_active", true),
        ]);

        return {
          user_id: cp.user_id,
          company_name_th: cp.company_name_th,
          company_name_en: cp.company_name_en,
          email: user?.email || "",
          created_at: cp.created_at,
          is_active: user?.isActive ?? false,
          doc_count: docCount || 0,
          customer_count: custCount || 0,
        };
      })
    );

    setClients(rows);
    setLoading(false);
  }

  const filteredClients = clients.filter((c) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (c.company_name_th || "").toLowerCase().includes(s) ||
      (c.company_name_en || "").toLowerCase().includes(s) ||
      c.email.toLowerCase().includes(s)
    );
  });

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      <header className="sticky top-0 z-30 border-b border-[#E8E6DF] bg-white/90 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 h-14 max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <span className="text-[14px] font-semibold text-[#1A1A18]">
              ⚙ Admin
            </span>
            <span className="text-[14px] font-medium text-[#378ADD]">ลูกค้า</span>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/login");
            }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            ออกจากระบบ admin
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[18px] font-bold text-[#1A1A18]">
            ลูกค้าทั้งหมด ({filteredClients.length})
          </h2>
          <Button
            size="sm"
            onClick={() => navigate("/admin/clients/new")}
          >
            <UserPlus className="w-4 h-4 mr-1" />
            เพิ่มลูกค้าใหม่
          </Button>
        </div>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#888780]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อบริษัท หรืออีเมล..."
              className="pl-9"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

        {loading ? (
          <Spinner />
        ) : filteredClients.length === 0 ? (
          <EmptyState
            title="ยังไม่มีลูกค้า"
            description="กด + เพิ่มลูกค้าใหม่ เพื่อเริ่มต้น"
            action={
              <Button size="sm" onClick={() => navigate("/admin/clients/new")}>
                <UserPlus className="w-4 h-4 mr-1" />
                เพิ่มลูกค้าใหม่
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {filteredClients.map((c) => (
              <Card
                key={c.user_id}
                className="!p-3.5"
                onClick={() => navigate(`/admin/clients/${c.user_id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[14px] font-semibold text-[#1A1A18] truncate">
                        {c.company_name_th || (
                          <span className="italic text-[#AAAAAA]">
                            ยังไม่ได้ตั้งค่าบริษัท
                          </span>
                        )}
                      </h3>
                      {!c.company_name_th && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#FAEEDA] text-[#633806] text-[10px] font-medium shrink-0">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          ยังไม่ได้ตั้งค่า
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-[#888780] mt-0.5">
                      {c.email || "(ไม่พบอีเมล)"}
                    </p>
                    <p className="text-[11px] text-[#AAAAAA] mt-1">
                      สร้างเมื่อ: {formatBuddhistDate(c.created_at)}
                      {c.doc_count > 0 && <> · {c.doc_count} เอกสาร</>}
                      {c.customer_count > 0 && <> · {c.customer_count} ลูกค้า</>}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${
                        c.is_active
                          ? "bg-[#EAF3DE] text-[#27500A]"
                          : "bg-[#F1EFE8] text-[#888780]"
                      }`}
                    >
                      {c.is_active ? "ใช้งานอยู่" : "ปิดการใช้งาน"}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
