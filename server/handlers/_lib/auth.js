import { ApiError } from "./http.js";
import { supabaseAdmin, supabaseAuth } from "./supabase.js";

function getBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "Missing authorization token");
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    throw new ApiError(401, "Missing authorization token");
  }
  return token;
}

function logAuthFailure(req, reason, detail) {
  console.warn("API auth failure", {
    path: req.url,
    reason,
    hasAuthorizationHeader: Boolean(req.headers.authorization || req.headers.Authorization),
    detail,
  });
}

export async function requireUser(req) {
  let token;
  try {
    token = getBearerToken(req);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      logAuthFailure(req, "missing_bearer_token");
    }
    throw error;
  }

  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data.user) {
    logAuthFailure(req, "invalid_session", error?.name || error?.message);
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
  const allowedPurposes = new Set([
    "logos",
    "signatures",
    "stamps",
    "pdfs",
    "exports",
    "attachments",
    "line-images",
  ]);
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
    const { data: membership } = await supabaseAdmin
      .from("client_members")
      .select("id")
      .eq("workspace_user_id", storageKey.userId)
      .eq("member_user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (membership) {
      return { user, profile };
    }

    throw new ApiError(403, "Forbidden");
  }

  return { user, profile };
}
