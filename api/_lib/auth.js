import { ApiError } from "./http.js";
import { supabaseAdmin, supabaseAuth } from "./supabase.js";

function getBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "Missing authorization token");
  }
  return authHeader.slice("Bearer ".length).trim();
}

export async function requireUser(req) {
  const token = getBearerToken(req);
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data.user) {
    throw new ApiError(401, "Invalid session");
  }
  return data.user;
}

export async function requireAdmin(req) {
  const user = await requireUser(req);
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (error || !profile || profile.role !== "admin") {
    throw new ApiError(403, "Admin access required");
  }

  return { user, profile };
}

export async function requireLogoAccess(req, key) {
  return requireStorageAccess(req, key);
}

export function getStoragePurpose(key) {
  const purpose = key.split("/")[0];
  const allowedPurposes = new Set(["logos", "signatures", "stamps", "pdfs", "exports", "attachments"]);
  return allowedPurposes.has(purpose) ? purpose : null;
}

export function validateStorageKey(key) {
  if (typeof key !== "string" || !key) {
    throw new ApiError(400, "Missing storage key");
  }

  if (key.startsWith("/") || key.includes("..") || key.includes("//")) {
    throw new ApiError(400, "Invalid storage key");
  }

  const parts = key.split("/");
  const purpose = getStoragePurpose(key);
  if (!purpose || parts.length < 3 || !parts[1]) {
    throw new ApiError(400, "Invalid storage key");
  }

  return {
    purpose,
    userId: parts[1],
  };
}

export async function requireStorageAccess(req, key) {
  const storageKey = validateStorageKey(key);
  const user = await requireUser(req);
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    throw new ApiError(403, "Profile not found");
  }

  if (profile.role === "admin") {
    return { user, profile };
  }

  if (storageKey.userId !== user.id) {
    throw new ApiError(403, "Forbidden");
  }

  return { user, profile };
}
