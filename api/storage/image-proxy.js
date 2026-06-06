import { ApiError, sendError, sendJson } from "../_lib/http.js";
import { getDownloadSignedUrl } from "../_lib/r2.js";

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET");
      res.setHeader("Access-Control-Allow-Headers", "Authorization");
      res.status(204).end();
      return;
    }

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const key = typeof req.query.key === "string" ? req.query.key : "";
    if (!key) throw new ApiError(400, "Missing key");

    const signedUrl = await getDownloadSignedUrl(key);

    const imgRes = await fetch(signedUrl);
    if (!imgRes.ok) throw new ApiError(502, "Failed to fetch image from storage");

    const contentType = imgRes.headers.get("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", buffer.length);
    res.status(200).send(buffer);
  } catch (error) {
    return sendError(res, error);
  }
}