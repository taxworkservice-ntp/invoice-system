import { useNavigate } from "react-router-dom";
import { Eye, LogOut } from "lucide-react";
import { useAuth, useClientProfile } from "../../hooks/useAuth";
import { logAuditEvent, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../lib/payroll/audit";
import { supabase } from "../../lib/supabase";

/**
 * Persistent banner while an admin views a client workspace. Exit restores
 * the admin session and returns to that client's admin page.
 */
export function ViewAsBanner() {
  const { profile, exitViewAs } = useAuth();
  const { clientProfile } = useClientProfile(profile?.id);
  const navigate = useNavigate();

  const workspaceId = profile?.workspace_user_id ?? profile?.id;
  if (profile?.role !== "client" || profile?.viewing_as !== true || !workspaceId) return null;

  async function handleExit() {
    const wsId = workspaceId;
    if (!wsId) return;
    let adminEmail = "";
    try {
      adminEmail = (await supabase.auth.getUser()).data.user?.email ?? "";
    } catch {
      // ignore — audit still records the workspace
    }
    exitViewAs();
    void logAuditEvent({
      action: AUDIT_ACTIONS.ADMIN_VIEW_AS_EXIT,
      entity_type: AUDIT_ENTITY_TYPES.CLIENT_PROFILE,
      entity_id: wsId,
      details: { admin_email: adminEmail, workspace_user_id: wsId },
    });
    navigate(`/admin/clients/${wsId}`, { replace: true });
  }

  return (
    <div className="bg-amber-500 text-white">
      <div className="flex items-center gap-2 px-4 py-2">
        <Eye className="w-4 h-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-label font-medium">
          กำลังดู workspace ของ {clientProfile?.company_name_th?.trim() || "ลูกค้า"}{" "}
          ในฐานะเจ้าของกิจการ — ทุกการกระทำถูกบันทึกในนามแอดมิน
        </p>
        <button
          type="button"
          onClick={() => void handleExit()}
          className="flex shrink-0 items-center gap-1 rounded-control bg-white/15 px-2.5 py-1 text-label font-semibold hover:bg-white/25 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          ออกจากมุมมอง
        </button>
      </div>
    </div>
  );
}
