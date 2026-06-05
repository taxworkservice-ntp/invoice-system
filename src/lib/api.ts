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
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  const rawText = await response.text();
  const payload = rawText ? JSON.parse(rawText) : {};

  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload as T;
}
