import path from "node:path";
import { defineConfig } from "vitest/config";

const testDb = process.env.TEST_DATABASE_URL ?? "postgresql://viochem:viochem@localhost:5432/viochem_test";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    fileParallelism: false,
    testTimeout: 20000,
    globalSetup: ["tests/setup-db.ts"],
    env: { DATABASE_URL: testDb },
  },
});
