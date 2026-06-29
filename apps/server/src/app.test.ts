import { appRouter } from "@c2pa-evidence-tamper-lab/api/routers/index";
import { testContext } from "@c2pa-evidence-tamper-lab/api/test-support/context";
import { createTestDb } from "@c2pa-evidence-tamper-lab/db/testing";
import { call } from "@orpc/server";
import { afterAll, beforeAll, expect, test } from "vitest";

// ponytail: smoke test only — the real C2PA verification tests (task.md §11)
// live colocated in packages/api/src/routers/*.
let context: Awaited<ReturnType<typeof testContext>>;
let close: () => void;

beforeAll(async () => {
  const t = await createTestDb();
  close = t.close;
  context = testContext(t.db);
});

afterAll(() => {
  close();
});

test("healthCheck procedure returns OK", async () => {
  const result = await call(appRouter.healthCheck, undefined, { context });
  expect(result).toBe("OK");
});
