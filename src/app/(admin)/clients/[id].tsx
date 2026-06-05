import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import {
  deleteAdminClient,
  getAdminClientUser,
  resetAdminClientWorkspace,
  updateAdminClientPassword,
  updateAdminClientStatus,
} from "../../../lib/adminApi";
import { supabase } from "../../../lib/supabase";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { Modal } from "../../../components/ui/Modal";
import { Input } from "../../../components/ui/Input";
import { useToast } from "../../../hooks/useToast";
import { formatBuddhistDate } from "../../../lib/dates";
import { DOC_TYPE_LABELS, STATUS_COLORS, STATUS_LABELS } from "../../../constants";
import type { ClientProfile, Document } from "../../../types";

const CARD_LABEL = "text-[11px] uppercase font-semibold text-[#888780] tracking-wide";

export default function AdminClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [email, setEmail] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [dealCount, setDealCount] = useState(0);
  const [activeCustomerCount, setActiveCustomerCount] = useState(0);
  const [activeItemCount, setActiveItemCount] = useState(0);
  const [activeDealCount, setActiveDealCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showWorkspaceResetModal, setShowWorkspaceResetModal] = useState(false);
  const [workspaceResetConfirm, setWorkspaceResetConfirm] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!id) return;
    void fetchData();
  }, [id]);

  async function fetchData() {
    if (!id) return;

    setLoading(true);

    const [cpRes, docRes, dealRes, userRes, activeCustomerRes, activeItemRes, activeDealRes] = await Promise.all([
      supabase.from("client_profiles").select("*").eq("user_id", id).single(),
      supabase
        .from("documents")
        .select("*, customer:customer_id(name)")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("deals").select("*", { count: "exact", head: true }).eq("user_id", id),
      getAdminClientUser(id),
      supabase.from("customers").select("*", { count: "exact", head: true }).eq("user_id", id).eq("is_active", true),
      supabase.from("items").select("*", { count: "exact", head: true }).eq("user_id", id).eq("is_active", true),
      supabase.from("deals").select("*", { count: "exact", head: true }).eq("user_id", id).eq("is_active", true),
    ]);

    if (!cpRes.error && cpRes.data) {
      setClientProfile(cpRes.data as ClientProfile);
    }
    if (!docRes.error && docRes.data) {
      setDocuments(docRes.data as unknown as Document[]);
    }
    if (!dealRes.error) {
      setDealCount(dealRes.count || 0);
    }
    if (!activeCustomerRes.error) {
      setActiveCustomerCount(activeCustomerRes.count || 0);
    }
    if (!activeItemRes.error) {
      setActiveItemCount(activeItemRes.count || 0);
    }
    if (!activeDealRes.error) {
      setActiveDealCount(activeDealRes.count || 0);
    }

    setEmail(userRes.email || "");
    setIsActive(userRes.isActive);
    setLoading(false);
  }

  function handleImpersonate() {
    if (!id || !clientProfile) return;
    sessionStorage.setItem("impersonate_user_id", id);
    sessionStorage.setItem("impersonate_name", clientProfile.company_name_th);
    sessionStorage.setItem("impersonate_return", `/admin/clients/${id}`);
    navigate("/home", { replace: true });
  }

  function handleStopImpersonate() {
    sessionStorage.removeItem("impersonate_user_id");
    sessionStorage.removeItem("impersonate_name");
    sessionStorage.removeItem("impersonate_return");
  }

  async function handleResetPassword() {
    if (!email) return;
    if (!window.confirm(`เธชเนเธเธญเธตเน€เธกเธฅเธฃเธตเน€เธเนเธ•เธฃเธซเธฑเธชเธเนเธฒเธเนเธซเน ${email}?`)) return;

    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("เธชเนเธเธญเธตเน€เธกเธฅเธฃเธตเน€เธเนเธ•เธฃเธซเธฑเธชเธเนเธฒเธเนเธฅเนเธง โ“");
    }
    setResetting(false);
  }

  async function handleChangePassword() {
    if (!id) return;
    if (!newPassword || newPassword.length < 6) {
      toast.error("เธฃเธซเธฑเธชเธเนเธฒเธเธ•เนเธญเธเธกเธตเธญเธขเนเธฒเธเธเนเธญเธข 6 เธ•เธฑเธงเธญเธฑเธเธฉเธฃ");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      toast.error("เธฃเธซเธฑเธชเธเนเธฒเธเนเธกเนเธ•เธฃเธเธเธฑเธ");
      return;
    }

    setChangingPassword(true);
    try {
      await updateAdminClientPassword(id, newPassword);
      toast.success("เน€เธเธฅเธตเนเธขเธเธฃเธซเธฑเธชเธเนเธฒเธเน€เธฃเธตเธขเธเธฃเนเธญเธขเนเธฅเนเธง โ“");
      setShowPasswordModal(false);
      setNewPassword("");
      setNewPasswordConfirm("");
    } catch (error: any) {
      toast.error(error.message || "Unable to change password");
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleToggleActive() {
    if (!id) return;

    const confirmMsg = isActive
      ? `เธเธดเธ”เธเธฒเธฃเนเธเนเธเธฒเธเธเธฑเธเธเธตเธเธญเธ ${clientProfile?.company_name_th || email}? เธฅเธนเธเธเนเธฒเธเธฐเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเนเธ”เน`
      : `เน€เธเธดเธ”เนเธเนเธเธฒเธเธเธฑเธเธเธตเธเธญเธ ${clientProfile?.company_name_th || email}?`;

    if (!window.confirm(confirmMsg)) return;

    setToggling(true);
    setShowMenu(false);

    try {
      await updateAdminClientStatus(id, !isActive);
      setIsActive(!isActive);
      toast.success(isActive ? "เธเธดเธ”เธเธฒเธฃเนเธเนเธเธฒเธเธเธฑเธเธเธตเนเธฅเนเธง" : "เน€เธเธดเธ”เนเธเนเธเธฒเธเธเธฑเธเธเธตเนเธฅเนเธง");
    } catch (error: any) {
      toast.error(error.message || "Unable to update account status");
    } finally {
      setToggling(false);
    }
  }

  async function handleArchiveAndResetWorkspace() {
    if (!id || !clientProfile) return;

    const expected = clientProfile.company_name_th?.trim() || email.trim();
    if (!expected) {
      toast.error("เนเธกเนเธเธเธเธทเนเธญเธเธฃเธดเธฉเธฑเธ—เธชเธณเธซเธฃเธฑเธเธขเธทเธเธขเธฑเธ");
      return;
    }

    if (workspaceResetConfirm.trim() !== expected) {
      toast.error("เธเธทเนเธญเธขเธทเธเธขเธฑเธเนเธกเนเธ•เธฃเธเธเธฑเธ");
      return;
    }

    setResetting(true);
    try {
      await resetAdminClientWorkspace(id);
      setShowWorkspaceResetModal(false);
      setWorkspaceResetConfirm("");
      toast.success("Archive workspace and reset numbering completed");
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || "Reset workspace failed");
    } finally {
      setResetting(false);
    }
  }

  async function handleDeleteClient() {
    if (!id || !clientProfile) return;

    const expected = clientProfile.company_name_th?.trim() || email.trim();
    if (deleteConfirm.trim() !== expected) {
      toast.error("เธเธทเนเธญเธขเธทเธเธขเธฑเธเนเธกเนเธ•เธฃเธเธเธฑเธ");
      return;
    }

    setDeleting(true);
    try {
      await deleteAdminClient(id);
      setShowDeleteModal(false);
      toast.success("เธฅเธเธเนเธญเธกเธนเธฅเธฅเธนเธเธเนเธฒเธ—เธฑเนเธเธซเธกเธ”เน€เธฃเธตเธขเธเธฃเนเธญเธขเนเธฅเนเธง");
      navigate("/admin/clients", { replace: true });
    } catch (error: any) {
      toast.error(error.message || "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธฅเธเธเนเธญเธกเธนเธฅเธฅเธนเธเธเนเธฒเนเธ”เน");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F6F3]">
        <header className="sticky top-0 z-30 border-b border-[#E8E6DF] bg-white/90 backdrop-blur-sm">
          <div className="flex items-center px-4 h-14 max-w-4xl mx-auto">
            <button onClick={() => navigate("/admin/clients")} className="text-gray-500 hover:text-gray-700 p-1">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-sm font-semibold text-gray-800 ml-2">เธเนเธญเธกเธนเธฅเธฅเธนเธเธเนเธฒ</h1>
          </div>
        </header>
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Spinner />
        </div>
      </div>
    );
  }

  if (!clientProfile) {
    return (
      <div className="min-h-screen bg-[#F7F6F3]">
        <header className="sticky top-0 z-30 border-b border-[#E8E6DF] bg-white/90 backdrop-blur-sm">
          <div className="flex items-center px-4 h-14 max-w-4xl mx-auto">
            <button onClick={() => navigate("/admin/clients")} className="text-gray-500 hover:text-gray-700 p-1">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-sm font-semibold text-gray-800 ml-2">เนเธกเนเธเธเธเนเธญเธกเธนเธฅ</h1>
          </div>
        </header>
        <div className="max-w-4xl mx-auto px-4 py-4">
          <p className="text-sm text-gray-500">เนเธกเนเธเธเธเนเธญเธกเธนเธฅเธฅเธนเธเธเนเธฒ</p>
        </div>
      </div>
    );
  }

  const isImpersonating = sessionStorage.getItem("impersonate_user_id") === id;
  const confirmName = clientProfile.company_name_th?.trim() || email.trim();

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      <header className="sticky top-0 z-30 border-b border-[#E8E6DF] bg-white/90 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 h-14 max-w-4xl mx-auto">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/admin/clients")} className="text-gray-500 hover:text-gray-700 p-1">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-sm font-semibold text-[#1A1A18] truncate">
              {clientProfile.company_name_th || email || "เธฅเธนเธเธเนเธฒ"}
            </h1>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowMenu((value) => !value)}
              className="text-gray-500 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-[#E8E6DF] rounded-lg shadow-lg py-1 min-w-[180px] z-50">
                <button
                  onClick={handleToggleActive}
                  disabled={toggling}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  {isActive ? "เธเธดเธ”เธเธฒเธฃเนเธเนเธเธฒเธเธเธฑเธเธเธต" : "เน€เธเธดเธ”เนเธเนเธเธฒเธเธเธฑเธเธเธต"}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {isImpersonating && (
        <div className="bg-[#FAEEDA] border-b border-[#E8D5B2] text-[#633806] px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => {
                handleStopImpersonate();
                window.location.reload();
              }}
              className="flex items-center gap-1 text-[#633806] font-medium text-sm hover:underline shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              เธซเธขเธธเธ”เธ”เธนเนเธเธเธฒเธเธฐเธฅเธนเธเธเนเธฒ
            </button>
          </div>
          <span className="text-sm text-[#633806]/80 truncate ml-2">
            เธเธณเธฅเธฑเธเธ”เธนเนเธเธเธฒเธเธฐ: <strong>{clientProfile.company_name_th}</strong>
          </span>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        <div className={CARD_LABEL}>เธเนเธญเธกเธนเธฅเธฅเธนเธเธเนเธฒ</div>

        <Card>
          <div className="space-y-2">
            <div>
              <span className="text-[11px] text-[#888780]">เธเธทเนเธญเธเธฃเธดเธฉเธฑเธ—</span>
              <p className="text-[13px] text-[#1A1A18] font-medium">{clientProfile.company_name_th || "-"}</p>
            </div>
            {clientProfile.company_name_en && (
              <div>
                <span className="text-[11px] text-[#888780]">เธเธทเนเธญเธเธฃเธดเธฉเธฑเธ— (EN)</span>
                <p className="text-[13px] text-[#1A1A18]">{clientProfile.company_name_en}</p>
              </div>
            )}
            <div>
              <span className="text-[11px] text-[#888780]">เธญเธตเน€เธกเธฅ</span>
              <p className="text-[13px] text-[#1A1A18]">{email || "-"}</p>
            </div>
            {clientProfile.tax_id && (
              <div>
                <span className="text-[11px] text-[#888780]">เน€เธฅเธเธเธนเนเน€เธชเธตเธขเธ เธฒเธฉเธต</span>
                <p className="text-[13px] text-[#1A1A18]">{clientProfile.tax_id}</p>
              </div>
            )}
            {clientProfile.address && (
              <div>
                <span className="text-[11px] text-[#888780]">เธ—เธตเนเธญเธขเธนเน</span>
                <p className="text-[13px] text-[#1A1A18]">{clientProfile.address}</p>
              </div>
            )}
            {clientProfile.phone && (
              <div>
                <span className="text-[11px] text-[#888780]">เนเธ—เธฃ</span>
                <p className="text-[13px] text-[#1A1A18]">{clientProfile.phone}</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-4 pt-2 border-t border-[#E8E6DF]">
              <div>
                <span className="text-[11px] text-[#888780]">VAT</span>
                <p className="text-[13px] text-[#1A1A18]">
                  {clientProfile.vat_registered ? "เธเธ”เธ—เธฐเน€เธเธตเธขเธ" : "เนเธกเนเนเธ”เนเธเธ”"}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-[#888780]">WHT เน€เธฃเธดเนเธกเธ•เนเธ</span>
                <p className="text-[13px] text-[#1A1A18]">
                  {clientProfile.default_wht_rate === "0" ? "เนเธกเนเธกเธต" : `${clientProfile.default_wht_rate}%`}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-[#888780]">เธชเธ–เธฒเธเธฐ</span>
                <p className="text-[13px]">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${
                      isActive ? "bg-[#EAF3DE] text-[#27500A]" : "bg-[#F1EFE8] text-[#888780]"
                    }`}
                  >
                    {isActive ? "เนเธเนเธเธฒเธเธญเธขเธนเน" : "เธเธดเธ”เธเธฒเธฃเนเธเนเธเธฒเธ"}
                  </span>
                </p>
              </div>
            </div>
            <div className="pt-1">
              <span className="text-[11px] text-[#888780]">เธชเธฃเนเธฒเธเธเธฑเธเธเธตเน€เธกเธทเนเธญ: {formatBuddhistDate(clientProfile.created_at)}</span>
              <span className="text-[11px] text-[#888780] ml-4">เน€เธญเธเธชเธฒเธฃเธ—เธฑเนเธเธซเธกเธ”: {documents.length >= 10 ? "10+" : documents.length}</span>
              <span className="text-[11px] text-[#888780] ml-4">Deal: {dealCount}</span>
            </div>
          </div>
        </Card>

        <div className={CARD_LABEL}>เธเธฒเธฃเธเธฑเธ”เธเธฒเธฃ</div>

        <Card>
          <div className="space-y-2">
            <Button
              onClick={handleImpersonate}
              className="w-full"
              style={{ backgroundColor: "#E6F1FB", color: "#0C447C", border: "0.5px solid #378ADD" }}
            >
              เธ”เธนเนเธเธเธฒเธเธฐเธฅเธนเธเธเนเธฒ
            </Button>

            <Button variant="secondary" className="w-full" onClick={handleResetPassword} disabled={resetting || !email}>
              {resetting ? "เธเธณเธฅเธฑเธเธชเนเธเธญเธตเน€เธกเธฅ..." : "เธฃเธตเน€เธเนเธ•เธฃเธซเธฑเธชเธเนเธฒเธ (เธชเนเธเธญเธตเน€เธกเธฅ)"}
            </Button>

            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setNewPassword("");
                setNewPasswordConfirm("");
                setShowPasswordModal(true);
              }}
              disabled={!id}
            >
              เน€เธเธฅเธตเนเธขเธเธฃเธซเธฑเธชเธเนเธฒเธ (เธเธณเธซเธเธ”เน€เธญเธ)
            </Button>

            <Button variant="secondary" className="w-full text-[#C0392B] border-[#C0392B]/20 hover:bg-red-50" onClick={handleToggleActive} disabled={toggling}>
              {toggling ? "เธเธณเธฅเธฑเธเธ”เธณเน€เธเธดเธเธเธฒเธฃ..." : isActive ? "เธเธดเธ”เธเธฒเธฃเนเธเนเธเธฒเธเธเธฑเธเธเธต" : "เน€เธเธดเธ”เนเธเนเธเธฒเธเธเธฑเธเธเธต"}
            </Button>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Start New Workspace</div>
              <p className="mt-1 text-sm leading-6 text-amber-900">
                Archive active deals, customers, and catalog items for this client, then reset document numbering to start from the beginning again.
                Old documents remain available as history.
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-amber-900/80">
                <div>Active deals: {activeDealCount}</div>
                <div>Active customers: {activeCustomerCount}</div>
                <div>Active items: {activeItemCount}</div>
              </div>
              <Button
                variant="danger"
                className="mt-3 w-full justify-center"
                onClick={() => {
                  setWorkspaceResetConfirm("");
                  setShowWorkspaceResetModal(true);
                }}
              >
                Archive workspace and reset numbering
              </Button>
            </div>

            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-red-800">Delete Client</div>
              <p className="mt-1 text-sm leading-6 text-red-900">
                Permanently delete this client, all their documents, customers, items, and account data.
                This action cannot be undone.
              </p>
              <Button
                variant="danger"
                className="mt-3 w-full justify-center"
                onClick={() => {
                  setDeleteConfirm("");
                  setShowDeleteModal(true);
                }}
              >
                Delete client permanently
              </Button>
            </div>
          </div>
        </Card>

        <div className={CARD_LABEL}>เน€เธญเธเธชเธฒเธฃเธฅเนเธฒเธชเธธเธ” ({documents.length >= 10 ? "10+" : documents.length} เธฃเธฒเธขเธเธฒเธฃ)</div>

        <Card>
          {documents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">เธขเธฑเธเนเธกเนเธกเธตเน€เธญเธเธชเธฒเธฃ</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[#E8E6DF] text-[#888780]">
                    <th className="text-left py-2 pr-2">เน€เธฅเธเธ—เธตเน</th>
                    <th className="text-left py-2 pr-2">เธเธฃเธฐเน€เธ เธ—</th>
                    <th className="text-left py-2 pr-2">เธฅเธนเธเธเนเธฒ</th>
                    <th className="text-right py-2 pr-2">เธขเธญเธ”เธฃเธงเธก</th>
                    <th className="text-left py-2">เธชเธ–เธฒเธเธฐ</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document) => (
                    <tr key={document.id} className="border-b border-[#E8E6DF]/50 hover:bg-gray-50 cursor-pointer">
                      <td className="py-2 pr-2 font-medium">{document.doc_number || "-"}</td>
                      <td className="py-2 pr-2">{DOC_TYPE_LABELS[document.doc_type]?.th || document.doc_type}</td>
                      <td className="py-2 pr-2 text-[#888780]">{(document as any).customer?.name || "-"}</td>
                      <td className="py-2 pr-2 text-right">เธฟ {document.total_amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                      <td className="py-2">
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium ${
                            STATUS_COLORS[document.status]?.bg || "bg-[#F1EFE8]"
                          } ${STATUS_COLORS[document.status]?.text || "text-[#444441]"}`}
                        >
                          {STATUS_LABELS[document.status] || document.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={showWorkspaceResetModal}
        onClose={() => {
          if (!resetting) {
            setShowWorkspaceResetModal(false);
            setWorkspaceResetConfirm("");
          }
        }}
        title="Archive workspace and reset numbering"
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-gray-700">
            This will hide the client&apos;s active workspace from normal day-to-day screens by archiving active deals, customers, and items.
            It will also reset document numbering back to the start. Existing documents remain in the database as history.
          </p>
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
            <div>Active deals to archive: {activeDealCount}</div>
            <div>Active customers to archive: {activeCustomerCount}</div>
            <div>Active items to archive: {activeItemCount}</div>
          </div>
          <Input
            id="workspace-reset-confirm"
            label={`Type "${confirmName}" to confirm`}
            value={workspaceResetConfirm}
            onChange={(event) => setWorkspaceResetConfirm(event.target.value)}
            placeholder={confirmName}
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setShowWorkspaceResetModal(false);
                setWorkspaceResetConfirm("");
              }}
              disabled={resetting}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleArchiveAndResetWorkspace} loading={resetting} disabled={workspaceResetConfirm.trim() !== confirmName}>
              Confirm reset
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showDeleteModal}
        onClose={() => {
          if (!deleting) {
            setShowDeleteModal(false);
            setDeleteConfirm("");
          }
        }}
        title="Delete client permanently"
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-gray-700">
            This will <strong className="text-red-600">permanently delete</strong> the client{" "}
            <strong>{clientProfile.company_name_th || email}</strong>, including:
          </p>
          <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
            <li>All documents ({dealCount} deals, {documents.length} recent docs)</li>
            <li>All customers ({activeCustomerCount} active)</li>
            <li>All catalog items ({activeItemCount} active)</li>
            <li>Company profile, settings, and numbering</li>
            <li>Login account ({email})</li>
          </ul>
          <p className="text-sm font-semibold text-red-600">This action is irreversible. The data cannot be recovered.</p>
          <Input
            id="delete-confirm"
            label={`Type "${confirmName}" to confirm deletion`}
            value={deleteConfirm}
            onChange={(event) => setDeleteConfirm(event.target.value)}
            placeholder={confirmName}
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setDeleteConfirm("");
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteClient} loading={deleting} disabled={deleteConfirm.trim() !== confirmName}>
              Delete permanently
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showPasswordModal}
        onClose={() => {
          if (!changingPassword) {
            setShowPasswordModal(false);
            setNewPassword("");
            setNewPasswordConfirm("");
          }
        }}
        title="เน€เธเธฅเธตเนเธขเธเธฃเธซเธฑเธชเธเนเธฒเธ"
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-gray-700">
            เธเธณเธซเธเธ”เธฃเธซเธฑเธชเธเนเธฒเธเนเธซเธกเนเนเธซเนเธเธฑเธ <strong>{clientProfile.company_name_th || email}</strong>
          </p>
          <Input
            id="new-password"
            label="เธฃเธซเธฑเธชเธเนเธฒเธเนเธซเธกเน"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="เธฃเธซเธฑเธชเธเนเธฒเธเธญเธขเนเธฒเธเธเนเธญเธข 6 เธ•เธฑเธงเธญเธฑเธเธฉเธฃ"
          />
          <Input
            id="new-password-confirm"
            label="เธขเธทเธเธขเธฑเธเธฃเธซเธฑเธชเธเนเธฒเธเนเธซเธกเน"
            type="password"
            value={newPasswordConfirm}
            onChange={(event) => setNewPasswordConfirm(event.target.value)}
            placeholder="เนเธชเนเธฃเธซเธฑเธชเธเนเธฒเธเธญเธตเธเธเธฃเธฑเนเธ"
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setShowPasswordModal(false);
                setNewPassword("");
                setNewPasswordConfirm("");
              }}
              disabled={changingPassword}
            >
              เธขเธเน€เธฅเธดเธ
            </Button>
            <Button onClick={handleChangePassword} loading={changingPassword} disabled={!newPassword || !newPasswordConfirm}>
              เน€เธเธฅเธตเนเธขเธเธฃเธซเธฑเธชเธเนเธฒเธ
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
