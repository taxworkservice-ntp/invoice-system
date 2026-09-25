import { requireAdmin } from "../../../_lib/auth.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../../../_lib/http.js";
import { deleteR2Object } from "../../../_lib/r2.js";
import { supabaseAdmin } from "../../../_lib/supabase.js";

async function handleGetClient(id) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
  if (error) throw error;
  if (!data?.user) throw new ApiError(404, "Client not found");

  return {
    user: {
      id: data.user.id,
      email: data.user.email || "",
      isActive: !data.user.banned_until,
    },
  };
}

/**
 * Destructive/admin actions must target a client workspace — never another
 * admin (or a missing) account. requireAdmin alone doesn't check the target.
 */
async function requireClientTarget(id) {
  const { data, error } = await supabaseAdmin.from("profiles").select("role").eq("id", id).single();
  if (error || !data) throw new ApiError(404, "Client not found");
  if (data.role !== "client") throw new ApiError(400, "Action applies to client workspaces only");
}

async function handleUpdatePassword(id, body, actorId) {
  const { password } = body;
  if (!password || password.length < 6)
    throw new ApiError(400, "Password must be at least 6 characters");
  await requireClientTarget(id);
  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password });
  if (error) throw error;
  await insertResetAudit("password.change", id, actorId, {});
  return { success: true };
}

async function handleUpdateStatus(id, body, actorId) {
  const { active } = body;
  if (typeof active !== "boolean") throw new ApiError(400, "Active flag is required");
  await requireClientTarget(id);
  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
    ban_duration: active ? "none" : "876000h",
  });
  if (error) throw error;
  await insertResetAudit("login-status.change", id, actorId, { active });
  return { success: true, isActive: active };
}

async function insertResetAudit(action, clientId, actorId, after = {}) {
  const { error } = await supabaseAdmin.from("client_permission_audit").insert({
    workspace_user_id: clientId,
    actor_user_id: actorId,
    target_member_id: null,
    action,
    before: null,
    after,
  });
  if (error) throw error;
}

/**
 * Server-enforced destructive-action guards. UI modals collect these, but a
 * direct POST must never bypass them: reason (min 3 chars) + typed confirm
 * name (company TH name or login email, compared server-side).
 */
async function requireDestructiveConfirm(id, body) {
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 200) : "";
  if (reason.length < 3) throw new ApiError(400, "กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร");

  const confirmName = typeof body?.confirmName === "string" ? body.confirmName.trim() : "";
  if (!confirmName) throw new ApiError(400, "กรุณาพิมพ์ชื่อยืนยัน");

  const [{ data: profile }, { data: authUser }] = await Promise.all([
    supabaseAdmin.from("client_profiles").select("company_name_th").eq("user_id", id).single(),
    supabaseAdmin.auth.admin.getUserById(id).catch(() => ({ data: null })),
  ]);
  const expected = profile?.company_name_th?.trim() || authUser?.user?.email?.trim() || "";
  if (!expected || confirmName !== expected) throw new ApiError(400, "ชื่อยืนยันไม่ตรงกัน");

  return reason;
}

async function handleResetWorkspace(id, actorId, body) {
  await requireClientTarget(id);
  const reason = await requireDestructiveConfirm(id, body);
  const [dealUpdate, customerUpdate, itemUpdate, sequenceUpdate, dealSequenceUpdate] =
    await Promise.all([
      supabaseAdmin
        .from("deals")
        .update({ is_active: false }, { count: "exact" })
        .eq("user_id", id)
        .eq("is_active", true),
      supabaseAdmin
        .from("customers")
        .update({ is_active: false }, { count: "exact" })
        .eq("user_id", id)
        .eq("is_active", true),
      supabaseAdmin
        .from("items")
        .update({ is_active: false }, { count: "exact" })
        .eq("user_id", id)
        .eq("is_active", true),
      supabaseAdmin
        .from("doc_number_sequences")
        .update({ last_sequence: 0, last_year: null })
        .eq("user_id", id),
      supabaseAdmin
        .from("deal_number_sequences")
        .update({ last_sequence: 0, last_month: 0 })
        .eq("user_id", id),
    ]);

  const firstError =
    dealUpdate.error ||
    customerUpdate.error ||
    itemUpdate.error ||
    sequenceUpdate.error ||
    dealSequenceUpdate.error;
  if (firstError) throw firstError;

  const summary = {
    deals_archived: dealUpdate.count ?? 0,
    customers_archived: customerUpdate.count ?? 0,
    items_archived: itemUpdate.count ?? 0,
    numbering_reset: ["doc_number_sequences", "deal_number_sequences"],
    reason,
  };
  await insertResetAudit("reset-workspace", id, actorId, summary);
  return { success: true, summary };
}

async function deleteR2ObjectsBestEffort(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return;
  await Promise.all(
    keys.map((key) =>
      deleteR2Object(key).catch((error) => {
        console.warn(
          "[admin reset-documents] Failed to delete R2 object",
          key,
          error?.message || error,
        );
      }),
    ),
  );
}

async function handlePreviewResetDocuments(id) {
  await requireClientTarget(id);
  const { data, error } = await supabaseAdmin.rpc("admin_preview_reset_client_documents", {
    p_target_user_id: id,
  });
  if (error) {
    if (error.code === "42501") throw new ApiError(403, "Admin access required");
    throw error;
  }
  return { success: true, preview: data };
}

async function handleResetDocuments(id, actorId, reason) {
  await requireClientTarget(id);
  const cleanReason = typeof reason === "string" ? reason.trim().slice(0, 200) : "";
  const { data, error } = await supabaseAdmin.rpc("admin_reset_client_documents", {
    p_target_user_id: id,
    p_actor_user_id: actorId,
    p_reason: cleanReason || null,
  });
  if (error) {
    if (error.code === "42501") throw new ApiError(403, "Admin access required");
    throw error;
  }

  await deleteR2ObjectsBestEffort(data?.r2_keys);

  return { success: true, summary: data };
}

async function handlePreviewResetAll(id) {
  await requireClientTarget(id);
  const { data, error } = await supabaseAdmin.rpc("admin_preview_reset_client_all", {
    p_target_user_id: id,
  });
  if (error) {
    if (error.code === "42501") throw new ApiError(403, "Admin access required");
    throw error;
  }
  return { success: true, preview: data };
}

async function handlePreviewResetWorkspace(id) {
  await requireClientTarget(id);
  const { data, error } = await supabaseAdmin.rpc("admin_preview_reset_workspace", {
    p_target_user_id: id,
  });
  if (error) {
    if (error.code === "42501") throw new ApiError(403, "Admin access required");
    throw error;
  }
  return { success: true, preview: data };
}

async function handleResetAll(id, actorId, body) {
  await requireClientTarget(id);
  const reason = await requireDestructiveConfirm(id, body);
  // Atomic: snapshot + delete + reseed + backup + audit in one transaction.
  const { data, error } = await supabaseAdmin.rpc("admin_reset_client_all", {
    p_target_user_id: id,
    p_actor_user_id: actorId,
    p_reason: reason,
  });
  if (error) {
    if (error.code === "42501") throw new ApiError(403, "Admin access required");
    throw error;
  }

  await deleteR2ObjectsBestEffort(data?.r2_keys);

  return { success: true, summary: data };
}

async function handleDeleteClient(id, actorId, body) {
  await requireClientTarget(id);
  const reason = await requireDestructiveConfirm(id, body);
  // Atomic table wipe + snapshot + audit in one transaction (fail-closed:
  // any failure rolls back, no silent partial wipe). Auth user is deleted
  // afterwards — auth.admin is not reachable from SQL.
  const { data, error } = await supabaseAdmin.rpc("admin_delete_client_workspace", {
    p_target_user_id: id,
    p_actor_user_id: actorId,
    p_reason: reason,
  });
  if (error) {
    if (error.code === "42501") throw new ApiError(403, "Admin access required");
    throw error;
  }

  await deleteR2ObjectsBestEffort(data?.r2_keys);

  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (authErr) throw authErr;
  return { success: true, summary: data };
}

export default async function handler(req, res) {
  try {
    const { user } = await requireAdmin(req);
    const actorId = user.id;

    const id = req.query.id;
    if (!id) throw new ApiError(400, "Missing client id");

    if (req.method === "GET") {
      return sendJson(res, 200, await handleGetClient(id));
    }

    if (req.method === "POST") {
      const body = readJsonBody(req);
      const action = body?.action;

      switch (action) {
        case "password":
          return sendJson(res, 200, await handleUpdatePassword(id, body, actorId));
        case "status":
          return sendJson(res, 200, await handleUpdateStatus(id, body, actorId));
        case "reset-workspace":
          return sendJson(res, 200, await handleResetWorkspace(id, actorId, body));
        case "reset-workspace-preview":
          return sendJson(res, 200, await handlePreviewResetWorkspace(id));
        case "reset-documents-preview":
          return sendJson(res, 200, await handlePreviewResetDocuments(id));
        case "reset-documents":
          return sendJson(res, 200, await handleResetDocuments(id, actorId, body?.reason));
        case "reset-all-preview":
          return sendJson(res, 200, await handlePreviewResetAll(id));
        case "reset-all":
          return sendJson(res, 200, await handleResetAll(id, actorId, body));
        default:
          throw new ApiError(400, `Unknown action: ${action || "(none)"}`);
      }
    }

    if (req.method === "DELETE") {
      const body = readJsonBody(req);
      return sendJson(res, 200, await handleDeleteClient(id, actorId, body));
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    return sendError(res, error);
  }
}
