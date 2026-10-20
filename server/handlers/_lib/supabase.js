import { createClient } from "@supabase/supabase-js";
import { getRequestToken } from "./context.js";
import { getEnv } from "./env.js";

const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
// Never fall back to a VITE_-prefixed name here: Vite inlines every
// VITE_* variable into the client bundle, which would leak the key.
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const hasServiceRoleKey = Boolean(supabaseServiceRoleKey);

const serviceRoleClient = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// Without a service-role key the API can still serve the caller's own
// workspace: the anon key plus the caller's JWT gives a client whose queries
// are bounded by RLS, which is what the storage and PDF routes need (they only
// ever touch rows the signed-in user may already read or write).
const scopedClients = new Map();
const SCOPED_CLIENT_LIMIT = 20;

function scopedClient() {
  const token = getRequestToken();
  if (!token) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set and the request carries no session token",
    );
  }

  const cached = scopedClients.get(token);
  if (cached) return cached;

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  scopedClients.set(token, client);
  if (scopedClients.size > SCOPED_CLIENT_LIMIT) {
    scopedClients.delete(scopedClients.keys().next().value);
  }
  return client;
}

const ADMIN_API_UNAVAILABLE =
  "SUPABASE_SERVICE_ROLE_KEY is not set: the Supabase admin API is unavailable in local mode";

function localScopedAdmin() {
  return {
    from: (table) => scopedClient().from(table),
    rpc: (fn, args) => scopedClient().rpc(fn, args),
    get auth() {
      return {
        getUser: (token) => supabaseAuth.auth.getUser(token),
        admin: new Proxy(
          {},
          {
            get() {
              throw new Error(ADMIN_API_UNAVAILABLE);
            },
          },
        ),
      };
    },
  };
}

export const supabaseAdmin = serviceRoleClient ?? localScopedAdmin();
