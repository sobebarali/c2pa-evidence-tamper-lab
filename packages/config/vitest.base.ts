import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

// Dummy env for tests — @c2pa-evidence-tamper-lab/env validates process.env at
// import, so any package whose test graph reaches it needs these set. Extend as
// new env vars land. DATABASE_URL is in-memory and never actually connected
// (tests use createTestDb()); DATA_DIR points at the OS temp dir so storage
// integration tests don't litter the workspace.
export const testEnv = {
  DATABASE_URL: "file::memory:",
  CORS_ORIGIN: "http://localhost:3001",
  NODE_ENV: "test",
  DATA_DIR: join(tmpdir(), "c2pa-lab-test-data"),
} satisfies Record<string, string>;

interface Options {
  /** Injected into process.env for the run (e.g. dummy @c2pa-evidence-tamper-lab/env vars). */
  env?: Record<string, string>;
  /** Default 20s — C2PA signing + libSQL schema push are slower than unit tests. */
  testTimeout?: number;
}

// Shared Vitest base. Each package's vitest.config.ts is one line:
//   export default defineVitestConfig({ env: { ... } })
export function defineVitestConfig(options: Options = {}) {
  return defineConfig({
    test: {
      globals: true,
      environment: "node",
      clearMocks: true,
      // matches *.test.ts and *.integration.test.ts; excludes opt-in *.smoke.ts
      include: ["src/**/*.{test,spec}.ts"],
      passWithNoTests: true,
      testTimeout: options.testTimeout ?? 20_000,
      env: options.env,
    },
  });
}
