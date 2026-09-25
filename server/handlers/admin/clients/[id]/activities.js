import { requireAdmin } from "../../../_lib/auth.js";
import { ApiError, sendError, sendJson } from "../../../_lib/http.js";
import { supabaseAdmin } from "../../../_lib/supabase.js";

/**
 * Admin deal-activity feed.
 *
 *   GET /api/admin/clients/:id/activities?limit=100
 *       → newest deal_activities across the client's workspace with a
 *         deal map (deal_number, title, customer name) for display.
 *
 * Read-only support surface: lets admin see what the client's team did
 * (issued, paid, voided…) without touching data. Service role bypasses
 * RLS; requireAdmin + requireClientTarget guard the endpoint.
 */
async function requireClientTarget(id) {
  const { data, error } = await supabaseAdmin.from("profiles").select("role").eq("id", id).single();
  if (error || !data) throw new ApiError(404, "Client not found");
  if (data.role !== "client") throw new ApiError(400, "Action applies to client workspaces only");
}

export default async function handler(req, res) {
  try {
    await requireAdmin(req);

    const id = req.query.id;
    if (!id) throw new ApiError(400, "Missing client id");

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    await requireClientTarget(id);

    const limit = Math.min(Math.max(parseInt(req.query.limit || "100", 10) || 100, 1), 200);

    const { data: deals, error: dealError } = await supabaseAdmin
      .from("deals")
      .select("id, deal_number, title, updated_at, customers(name)")
      .eq("user_id", id)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (dealError) throw dealError;

    const dealIds = (deals || []).map((deal) => deal.id);
    let activities = [];
    if (dealIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("deal_activities")
        .select(
          "id, deal_id, document_id, actor_name, actor_role, event_type, description, metadata, created_at",
        )
        .in("deal_id", dealIds)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      activities = data || [];
    }

    return sendJson(res, 200, { activities, deals: deals || [] });
  } catch (error) {
    console.error("[admin activities] Unhandled error:", error);
    return sendError(res, error);
  }
}
