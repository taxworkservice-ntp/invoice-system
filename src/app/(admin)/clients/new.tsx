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
      setEmailError("เธเธฃเธธเธ“เธฒเธเธฃเธญเธเธญเธตเน€เธกเธฅ");
      return;
    }

    setCreating(true);

    try {
      const result = await createAdminClient({
        email: email.trim(),
        companyName: companyName.trim(),
        adminNote: adminNote.trim(),
      });
      toast.success(`เธชเธฃเนเธฒเธเธเธฑเธเธเธตเนเธฅเนเธง เธชเนเธเธญเธตเน€เธกเธฅเน€เธเธดเธเนเธเธ—เธตเน ${result.email}`);
      navigate(`/admin/clients/${result.userId}`, { replace: true });
    } catch (e: any) {
      if (e.message?.includes("already been registered") || e.message?.includes("already exists")) {
        setEmailError("เธญเธตเน€เธกเธฅเธเธตเนเธกเธตเธเธฑเธเธเธตเธญเธขเธนเนเนเธฅเนเธง");
      } else {
        setError(e.message || "เธชเธฃเนเธฒเธเธเธฑเธเธเธตเนเธกเนเธชเธณเน€เธฃเนเธ");
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
              <span className="text-sm">โ เธฅเธนเธเธเนเธฒ</span>
            </button>
            <h1 className="text-sm font-semibold text-gray-800">เน€เธเธดเนเธกเธฅเธนเธเธเนเธฒเนเธซเธกเน</h1>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <form onSubmit={handleCreate}>
          <Card>
            <div className="space-y-4">
              <Input
                label="เธญเธตเน€เธกเธฅ *"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                placeholder="เธญเธตเน€เธกเธฅเธชเธณเธซเธฃเธฑเธเน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธ"
                error={emailError}
                autoFocus
              />
              <p className="text-[11px] text-[#888780] -mt-3">
                เธฅเธนเธเธเนเธฒเธเธฐเนเธ”เนเธฃเธฑเธเธญเธตเน€เธกเธฅเธชเธณเธซเธฃเธฑเธเธ•เธฑเนเธเธฃเธซเธฑเธชเธเนเธฒเธ
              </p>

              <Input
                label="เธเธทเนเธญเธเธฃเธดเธฉเธฑเธ— (เน€เธเธทเนเธญเธเธ•เนเธ)"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="เธฅเธนเธเธเนเธฒเธชเธฒเธกเธฒเธฃเธ–เนเธเนเนเธเน€เธญเธเนเธ”เนเธ เธฒเธขเธซเธฅเธฑเธ"
              />

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  เธซเธกเธฒเธขเน€เธซเธ•เธธเธชเธณเธซเธฃเธฑเธ admin
                </label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="เธเธฑเธเธ—เธถเธเธชเนเธงเธเธ•เธฑเธงเธชเธณเธซเธฃเธฑเธ admin (เธฅเธนเธเธเนเธฒเนเธกเนเน€เธซเนเธ)"
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20 placeholder:text-gray-400 resize-none"
                />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? "เธเธณเธฅเธฑเธเธชเธฃเนเธฒเธ..." : "เธชเธฃเนเธฒเธเธเธฑเธเธเธตเนเธฅเธฐเธชเนเธเธญเธตเน€เธกเธฅเน€เธเธดเธ"}
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </div>
  );
}
