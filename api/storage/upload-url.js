import { requireLogoAccess } from "../_lib/auth.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../_lib/http.js";
import { getUploadSignedUrl } from "../_lib/r2.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const { key, contentType } = readJsonBody(req);
    if (!key) throw new ApiError(400, "Missing key");

    await requireLogoAccess(req, key);

    const uploadUrl = await getUploadSignedUrl(key, contentType);
    return sendJson(res, 200, { uploadUrl });
  } catch (error) {
    return sendError(res, error);
  }
}
