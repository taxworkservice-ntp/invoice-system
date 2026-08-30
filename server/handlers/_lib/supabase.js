import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./env.js";

const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
// Never fall back to a VITE_-prefixed name here: Vite inlines every
// VITE_* variable into the client bundle, which would leak the key.
const supabaseServiceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

export const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
