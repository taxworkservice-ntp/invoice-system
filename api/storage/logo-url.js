import { requireLogoAccess } from "../_lib/auth.js";
import { ApiError, sendError, sendJson } from "../_lib/http.js";
import { getDownloadSignedUrl } from "../_lib/r2.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const key = typeof req.query.key === "string" ? req.query.key : "";
    if (!key) throw new ApiError(400, "Missing key");

    await requireLogoAccess(req, key);

    const url = await getDownloadSignedUrl(key);
    return sendJson(res, 200, { url });
  } catch (error) {
    return sendError(res, error);
  }
}
