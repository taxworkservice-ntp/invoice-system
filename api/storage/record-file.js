import { requireStorageAccess, validateStorageKey } from "../_lib/auth.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../_lib/http.js";
import { supabaseAdmin } from "../_lib/supabase.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const { key, filename, contentType, sizeBytes, documentId } = readJsonBody(req);
    if (!key) throw new ApiError(400, "Missing key");

    const { purpose, userId } = validateStorageKey(key);
    await requireStorageAccess(req, key);

    const payload = {
      user_id: userId,
      document_id: documentId || null,
      r2_key: key,
      purpose,
      filename: filename || key.split("/").pop() || "file",
      content_type: contentType || "application/octet-stream",
      size_bytes: Number(sizeBytes) || 0,
    };

    const { data, error } = await supabaseAdmin
      .from("files")
      .upsert(payload, { onConflict: "r2_key" })
      .select("*")
      .single();

    if (error) throw error;

    return sendJson(res, 200, { file: data });
  } catch (error) {
    return sendError(res, error);
  }
}
