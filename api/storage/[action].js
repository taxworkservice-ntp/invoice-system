import { requireStorageAccess, requireUser, validateStorageKey } from "../_lib/auth.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../_lib/http.js";
import { deleteR2Object, getDownloadSignedUrl, getUploadSignedUrl } from "../_lib/r2.js";
import { supabaseAdmin } from "../_lib/supabase.js";

const MAX_BYTES_BY_PURPOSE = {
  logos: 2 * 1024 * 1024,
  signatures: 2 * 1024 * 1024,
  stamps: 2 * 1024 * 1024,
  pdfs: 10 * 1024 * 1024,
  exports: 10 * 1024 * 1024,
  attachments: 10 * 1024 * 1024,
};

function method(req, res, expected) {
  if (req.method !== expected) {
    res.setHeader("Allow", expected);
    throw new ApiError(405, "Method not allowed");
  }
}

function storageAction(req) {
  const action = req.query.action;
  return Array.isArray(action) ? action[0] : action;
}

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
}

async function handleUploadUrl(req, res) {
  method(req, res, "POST");

  const { key, contentType, sizeBytes } = readJsonBody(req);
  if (!key) throw new ApiError(400, "Missing key");

  validateUpload({ key, contentType, sizeBytes });
  await requireStorageAccess(req, key);

  const uploadUrl = await getUploadSignedUrl(key, contentType);
  return sendJson(res, 200, { uploadUrl });
}

async function handleDownloadUrl(req, res) {
  method(req, res, "GET");

  const key = typeof req.query.key === "string" ? req.query.key : "";
  if (!key) throw new ApiError(400, "Missing key");

  await requireStorageAccess(req, key);

  const url = await getDownloadSignedUrl(key);
  return sendJson(res, 200, { url });
}

async function handleImageProxy(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Authorization");
    res.status(204).end();
    return;
  }

  method(req, res, "GET");

  const key = typeof req.query.key === "string" ? req.query.key : "";
  if (!key) throw new ApiError(400, "Missing key");

  await requireStorageAccess(req, key);

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
}

async function handleRecordFile(req, res) {
  method(req, res, "POST");

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
}

async function handleDeleteFile(req, res) {
  method(req, res, "POST");

  const { key } = readJsonBody(req);
  if (!key) throw new ApiError(400, "Missing key");

  await requireStorageAccess(req, key);
  await deleteR2Object(key);

  const { error } = await supabaseAdmin.from("files").delete().eq("r2_key", key);
  if (error) throw error;

  return sendJson(res, 200, { ok: true });
}

async function handleDeleteDocumentFiles(req, res) {
  method(req, res, "POST");

  const user = await requireUser(req);
  const { documentId } = readJsonBody(req);
  if (!documentId) throw new ApiError(400, "Missing document id");

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) throw new ApiError(403, "Profile not found");

  const { data: document, error: documentError } = await supabaseAdmin
    .from("documents")
    .select("id, user_id")
    .eq("id", documentId)
    .single();

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
}

export default async function handler(req, res) {
  try {
    const action = storageAction(req);

    if (action === "upload-url") return await handleUploadUrl(req, res);
    if (action === "download-url" || action === "logo-url") return await handleDownloadUrl(req, res);
    if (action === "image-proxy") return await handleImageProxy(req, res);
    if (action === "record-file") return await handleRecordFile(req, res);
    if (action === "delete-file") return await handleDeleteFile(req, res);
    if (action === "delete-document-files") return await handleDeleteDocumentFiles(req, res);

    throw new ApiError(404, "Storage endpoint not found");
  } catch (error) {
    return sendError(res, error);
  }
}
