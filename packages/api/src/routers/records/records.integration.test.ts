import { createTestDb } from "@c2pa-evidence-tamper-lab/db/testing";
import { call } from "@orpc/server";
import { afterAll, beforeAll, expect, it } from "vitest";

import { testContext } from "../../test-support/context";
import { makeJpeg, sampleClaims, toFile } from "../../test-support/fixtures";
import { appRouter } from "../index";

const SHA256_HEX = /^[a-f0-9]{64}$/;

let context: ReturnType<typeof testContext>;
let close: () => void;
let evidenceId: string;

beforeAll(async () => {
  const t = await createTestDb();
  close = t.close;
  context = testContext(t.db);

  const up = await call(
    appRouter.upload.create,
    { file: toFile(await makeJpeg(), "o.jpg") },
    { context }
  );
  const signed = await call(
    appRouter.sign.create,
    { originalFileId: up.fileId, claims: sampleClaims },
    { context }
  );
  evidenceId = signed.evidenceId;
});

afterAll(() => {
  close();
});

it("lists the stored evidence record", async () => {
  const res = await call(appRouter.records.list, undefined, { context });
  expect(res.items).toHaveLength(1);
  expect(res.items[0]?.evidenceId).toBe(evidenceId);
  expect(res.items[0]?.signatureStatus).toBe("valid");
});

it("fetches one record by evidenceId", async () => {
  const res = await call(appRouter.records.get, { evidenceId }, { context });
  expect(res.evidenceId).toBe(evidenceId);
  expect(res.mode).toBe("journalism");
});

// CET-256 — the repository-receipt is persisted on sign and returned.
it("returns the repository receipt for a record", async () => {
  const res = await call(appRouter.records.get, { evidenceId }, { context });
  expect(res.repositoryReceipt?.repository).toBe("local-libsql");
  expect(res.repositoryReceipt?.signedFileHash).toMatch(SHA256_HEX);
});

it("returns NOT_FOUND for an unknown evidenceId", async () => {
  await expect(
    call(appRouter.records.get, { evidenceId: "ev_1999_999" }, { context })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
