import { requireStorageAccess, validateStorageKey } from "../_lib/auth.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../_lib/http.js";
import { getUploadSignedUrl } from "../_lib/r2.js";

const MAX_BYTES_BY_PURPOSE = {
  logos: 2 * 1024 * 1024,
  signatures: 2 * 1024 * 1024,
  stamps: 2 * 1024 * 1024,
  pdfs: 10 * 1024 * 1024,
  exports: 10 * 1024 * 1024,
  attachments: 10 * 1024 * 1024,
};

function validateUpload({ key, contentType, sizeBytes }) {
  const { purpose } = validateStorageKey(key);
  const maxBytes = MAX_BYTES_BY_PURPOSE[purpose];
  const size = Number(sizeBytes);

  if (!contentType || typeof contentType !== "string") {
    throw new ApiError(400, "Missing content type");
  }

  if (!Number.isFinite(size) || size <= 0) {
    throw new ApiError(400, "Missing file size");
  }

  if (size > maxBytes) {
    throw new ApiError(413, `File is too large. Max size is ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }

  if (["logos", "signatures", "stamps"].includes(purpose) && !contentType.startsWith("image/")) {
    throw new ApiError(415, "Only image uploads are allowed here.");
  }

  if (purpose === "pdfs" && contentType !== "application/pdf") {
    throw new ApiError(415, "Only PDF uploads are allowed here.");
  }

  if (purpose === "exports" && !/spreadsheet|excel|csv|zip/i.test(contentType)) {
    throw new ApiError(415, "Unsupported export file type.");
  }

  return { purpose };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const { key, contentType, sizeBytes } = readJsonBody(req);
    if (!key) throw new ApiError(400, "Missing key");

    validateUpload({ key, contentType, sizeBytes });
    await requireStorageAccess(req, key);

    const uploadUrl = await getUploadSignedUrl(key, contentType);
    return sendJson(res, 200, { uploadUrl });
  } catch (error) {
    return sendError(res, error);
  }
}
