import { requireAdmin } from "../../_lib/auth.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";

const DOC_TYPES = ["quotation", "invoice", "tax_invoice_receipt", "billing_note", "receipt", "delivery_note", "credit_note"];

function getDefaultPrefix(docType) {
  const map = {
    quotation: "QT",
    invoice: "INV",
    tax_invoice_receipt: "TAX",
    billing_note: "BN",
    receipt: "RC",
    delivery_note: "DN",
    credit_note: "CN",
  };
  return map[docType] || docType.toUpperCase().slice(0, 3);
}

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

async function handleUpdatePassword(id, body) {
  const { password } = body;
  if (!password || password.length < 6) throw new ApiError(400, "Password must be at least 6 characters");
  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password });
  if (error) throw error;
  return { success: true };
}

async function handleUpdateStatus(id, body) {
  const { active } = body;
  if (typeof active !== "boolean") throw new ApiError(400, "Active flag is required");
  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
    ban_duration: active ? "none" : "876000h",
  });
  if (error) throw error;
  return { success: true, isActive: active };
}

async function handleResetWorkspace(id) {
  const [dealUpdate, customerUpdate, itemUpdate, sequenceUpdate] = await Promise.all([
    supabaseAdmin.from("deals").update({ is_active: false }).eq("user_id", id).eq("is_active", true),
    supabaseAdmin.from("customers").update({ is_active: false }).eq("user_id", id).eq("is_active", true),
    supabaseAdmin.from("items").update({ is_active: false }).eq("user_id", id).eq("is_active", true),
    supabaseAdmin.from("doc_number_sequences").update({ last_sequence: 0, last_year: null }).eq("user_id", id),
  ]);

  const firstError = dealUpdate.error || customerUpdate.error || itemUpdate.error || sequenceUpdate.error;
  if (firstError) throw firstError;
  return { success: true };
}

async function handleResetDocuments(id) {
  await supabaseAdmin.from("billing_note_invoices").delete().eq("user_id", id);
  await supabaseAdmin.from("document_line_items").delete().eq("user_id", id);
  await supabaseAdmin.from("stock_movements").delete().eq("user_id", id);
  await supabaseAdmin.from("deals").delete().eq("user_id", id);
  await supabaseAdmin.from("documents").delete().eq("user_id", id);

  const { error: seqErr } = await supabaseAdmin
    .from("doc_number_sequences")
    .update({ last_sequence: 0, last_year: null, last_month: null })
    .eq("user_id", id);

  if (seqErr) throw seqErr;
  return { success: true };
}

async function handleResetAll(id) {
  await supabaseAdmin.from("billing_note_invoices").delete().eq("user_id", id);
  await supabaseAdmin.from("document_line_items").delete().eq("user_id", id);
  await supabaseAdmin.from("stock_movements").delete().eq("user_id", id);
  await supabaseAdmin.from("deals").delete().eq("user_id", id);
  await supabaseAdmin.from("documents").delete().eq("user_id", id);
  await supabaseAdmin.from("customers").delete().eq("user_id", id);
  await supabaseAdmin.from("items").delete().eq("user_id", id);
  await supabaseAdmin.from("doc_number_sequences").delete().eq("user_id", id);

  const inserts = DOC_TYPES.map((docType) => ({
    user_id: id,
    doc_type: docType,
    prefix: getDefaultPrefix(docType),
    reset_yearly: false,
    last_sequence: 0,
    last_year: null,
    last_month: null,
  }));

  const { error: seqErr } = await supabaseAdmin.from("doc_number_sequences").insert(inserts);
  if (seqErr) throw seqErr;
  return { success: true };
}

async function handleDeleteClient(id) {
  await supabaseAdmin.from("billing_note_invoices").delete().eq("user_id", id);
  await supabaseAdmin.from("document_line_items").delete().eq("user_id", id);
  await supabaseAdmin.from("stock_movements").delete().eq("user_id", id);
  await supabaseAdmin.from("deals").delete().eq("user_id", id);
  await supabaseAdmin.from("documents").delete().eq("user_id", id);
  await supabaseAdmin.from("customers").delete().eq("user_id", id);
  await supabaseAdmin.from("doc_number_sequences").delete().eq("user_id", id);
  await supabaseAdmin.from("items").delete().eq("user_id", id);
  await supabaseAdmin.from("client_profiles").delete().eq("user_id", id);
  await supabaseAdmin.from("profiles").delete().eq("id", id);

  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (authErr) throw authErr;
  return { success: true };
}

export default async function handler(req, res) {
  try {
    await requireAdmin(req);

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
          return sendJson(res, 200, await handleUpdatePassword(id, body));
        case "status":
          return sendJson(res, 200, await handleUpdateStatus(id, body));
        case "reset-workspace":
          return sendJson(res, 200, await handleResetWorkspace(id));
        case "reset-documents":
          return sendJson(res, 200, await handleResetDocuments(id));
        case "reset-all":
          return sendJson(res, 200, await handleResetAll(id));
        default:
          throw new ApiError(400, `Unknown action: ${action || "(none)"}`);
      }
    }

    if (req.method === "DELETE") {
      return sendJson(res, 200, await handleDeleteClient(id));
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    return sendError(res, error);
  }
}
