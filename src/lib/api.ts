import { supabase } from "./supabase";

const SESSION_REFRESH_MARGIN_MS = 60 * 1000;

export class ApiRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

function isSessionNearExpiry(expiresAt?: number | null): boolean {
  if (!expiresAt) return true;
  return expiresAt * 1000 - Date.now() <= SESSION_REFRESH_MARGIN_MS;
}

async function refreshAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.refreshSession();
  const token = data.session?.access_token;

  if (error || !token) {
    throw new ApiRequestError(401, "Session expired. Please sign in again.");
  }

  return token;
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  if (!data.session || isSessionNearExpiry(data.session.expires_at)) {
    return refreshAccessToken();
  }

  const token = data.session.access_token;
  if (!token) {
    return refreshAccessToken();
  }

  return token;
}

async function fetchWithToken(input: string, init: RequestInit, token: string): Promise<Response> {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

export async function apiFetchBlob(input: string, init: RequestInit = {}): Promise<Blob> {
  let token = await getAccessToken();
  let response = await fetchWithToken(input, init, token);

  if (response.status === 401) {
    token = await refreshAccessToken();
    response = await fetchWithToken(input, init, token);
  }

  if (!response.ok) {
    const rawText = await response.text();
    let message = `Request failed with status ${response.status}`;
    try {
      const parsed = JSON.parse(rawText);
      if (parsed && typeof parsed === "object" && typeof parsed.error === "string") message = parsed.error;
    } catch {
      if (rawText) message = rawText;
    }
    throw new ApiRequestError(response.status, message);
  }

  return response.blob();
}

export async function apiFetch<T>(input: string, init: RequestInit = {}): Promise<T> {
  let token = await getAccessToken();
  let response = await fetchWithToken(input, init, token);

  if (response.status === 401) {
    token = await refreshAccessToken();
    response = await fetchWithToken(input, init, token);
  }

  const rawText = await response.text();
  const contentType = response.headers.get("content-type") || "";

  let payload: unknown = {};
  if (rawText) {
    if (contentType.includes("application/json")) {
      payload = JSON.parse(rawText);
    } else {
      payload = { error: rawText };
    }
  }

  const payloadError =
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
      ? payload.error
      : null;

  if (!response.ok) {
    throw new ApiRequestError(response.status, payloadError || `Request failed with status ${response.status}`);
  }

  return payload as T;
}
