import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = new Proxy(createClient("https://example.invalid", "public-anon-key"), {
  get() {
    throw new Error("supabaseAdmin is no longer available in the browser. Use server APIs instead.");
  },
});
