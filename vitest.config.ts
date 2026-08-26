import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

// Development mode probes .env, .env.local, .env.development (+ .local) —
// matching how the app itself loads environment variables.
const env = loadEnv("development", process.cwd(), "");

export default defineConfig({
  test: {
    environment: "node",
    // All specs share ONE throwaway Supabase workspace (testcompany-vitest@gmail.com) and
    // resetWorkspace wipes that user's data, so files must NOT run in parallel.
    fileParallelism: false,
    include: ["tests/integration/**/*.spec.ts", "tests/payroll/**/*.test.ts"],
    env: {
      VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY:
        process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
    },
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
