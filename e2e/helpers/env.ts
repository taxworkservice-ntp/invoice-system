import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ENV_FILES = [".env", ".env.local", ".env.development"];

function readEnvFile(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  for (const file of ENV_FILES) {
    try {
      const raw = fs.readFileSync(path.resolve(file), "utf8");
      const value = raw.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();
      if (value) return value.replace(/^["']|["']$/g, "");
    } catch {
      // file missing — try next
    }
  }
  return undefined;
}

function readServiceKey(): string {
  const fromEnv =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    readEnvFile("SUPABASE_SERVICE_ROLE_KEY");
  if (fromEnv) return fromEnv;
  const raw = fs.readFileSync(path.resolve("supabase_key.md"), "utf8");
  return raw.split("\n").map((l) => l.trim()).find((l) => l.startsWith("eyJ"))!;
}

export const BASE_URL = "http://localhost:5173";
export const SUPABASE_URL = readEnvFile("VITE_SUPABASE_URL") || "";
if (!SUPABASE_URL) {
  throw new Error(
    `E2E setup: VITE_SUPABASE_URL not found in ${ENV_FILES.join(", ")}. ` +
      `Run 'vercel env pull .env.development' or create .env.`,
  );
}
export const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
export const TEST_EMAIL = "testcompany-vitest@gmail.com";
export const TEST_PASSWORD = "test1234";
export const AUTH_STATE_PATH = path.resolve("e2e/.auth/state.json");

/** Signed-in anon client — mirrors the app's RLS identity for API setup. */
let _client: SupabaseClient | null = null;
export async function api(): Promise<SupabaseClient> {
  if (!_client) {
    _client = createClient(SUPABASE_URL, readEnvFile("VITE_SUPABASE_ANON_KEY")!);
    const { error } = await _client.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    if (error) throw new Error(`E2E API sign-in failed: ${error.message}`);
  }
  return _client;
}

/** Service-role client for inspection/cleanup that must bypass RLS. */
let _admin: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(SUPABASE_URL, readServiceKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _admin;
}

export async function signInAndGetSession() {
  const client = await api();
  const { data, error } = await client.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) throw new Error(`E2E sign-in failed: ${error?.message}`);
  return data.session;
}

export function uid(): string {
  return crypto.randomUUID();
}
