import { supabase } from "./supabase";

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  const token = data.session?.access_token;
  if (!token) {
    throw new Error("No active session");
  }

  return token;
}

export async function apiFetch<T>(input: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();

  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

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
    throw new Error(payloadError || `Request failed with status ${response.status}`);
  }

  return payload as T;
}
