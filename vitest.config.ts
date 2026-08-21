import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

const env = loadEnv("", process.cwd(), "");

export default defineConfig({
  test: {
    environment: "node",
    // All specs share ONE Supabase workspace (testcompany@gmail.com) and
    // resetWorkspace wipes that user's data, so files must NOT run in parallel.
    fileParallelism: false,
    include: ["tests/integration/**/*.spec.ts"],
    env: {
      VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY,
    },
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
