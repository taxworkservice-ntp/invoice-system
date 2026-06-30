import { requireUser } from "../_lib/auth.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../_lib/http.js";
import { deleteR2Object } from "../_lib/r2.js";
import { supabaseAdmin } from "../_lib/supabase.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const user = await requireUser(req);
    const { documentId } = readJsonBody(req);
    if (!documentId) throw new ApiError(400, "Missing document id");

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) throw new ApiError(403, "Profile not found");

    let documentQuery = supabaseAdmin
      .from("documents")
      .select("id, user_id")
      .eq("id", documentId)
      .single();

    const { data: document, error: documentError } = await documentQuery;
    if (documentError || !document) throw new ApiError(404, "Document not found");

    if (profile.role !== "admin" && document.user_id !== user.id) {
      throw new ApiError(403, "Forbidden");
    }

    const { data: files, error: filesError } = await supabaseAdmin
      .from("files")
      .select("r2_key")
      .eq("document_id", documentId);

    if (filesError) throw filesError;

    await Promise.all((files || []).map((file) => deleteR2Object(file.r2_key)));

    const { error: deleteError } = await supabaseAdmin.from("files").delete().eq("document_id", documentId);
    if (deleteError) throw deleteError;

    return sendJson(res, 200, { deleted: files?.length || 0 });
  } catch (error) {
    return sendError(res, error);
  }
}
