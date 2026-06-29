import { createTestDb } from "@c2pa-evidence-tamper-lab/db/testing";
import { call } from "@orpc/server";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { testContext } from "../../test-support/context";
import { makeJpeg, toFile } from "../../test-support/fixtures";
import { appRouter } from "../index";

// The only place a mock is warranted: force the C2PA reader to fail so the
// `unknown` status (task.md §6 — "verifier failed") is reachable in a test.
vi.mock("../../integrations/c2pa", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../integrations/c2pa")>();
  return {
    ...actual,
    readManifest: () => {
      throw new Error("verifier exploded");
    },
  };
});

let context: ReturnType<typeof testContext>;
let close: () => void;

beforeAll(async () => {
  const t = await createTestDb();
  close = t.close;
  context = testContext(t.db);
});

afterAll(() => {
  close();
});

it("classifies an unexpected verifier failure as 'unknown', not an error", async () => {
  const res = await call(
    appRouter.verify.check,
    { file: toFile(await makeJpeg(), "u.jpg") },
    { context }
  );

  expect(res.uploadedFileStatus).toBe("unknown");
  expect(res.matchedEvidenceId).toBeNull();
  expect(res.matchedOriginalRecord).toBe(false);
  expect(res.reasonCodes).toContain("C2PA_VERIFIER_ERROR");
  // the file is still stored + addressable even though classification failed
  expect(res.uploadedFileId).toBeTruthy();
});
