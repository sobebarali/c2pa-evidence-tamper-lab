import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { evidenceRecords } from "@c2pa-evidence-tamper-lab/db/schema";
import { createTestDb } from "@c2pa-evidence-tamper-lab/db/testing";
import { env } from "@c2pa-evidence-tamper-lab/env/server";
import { call } from "@orpc/server";
import { afterAll, beforeAll, expect, it } from "vitest";

import { testContext } from "../../test-support/context";
import { makeJpeg, sampleClaims, toFile } from "../../test-support/fixtures";
import { appRouter } from "../index";

const EVIDENCE_ID = /^ev_\d{4}_\d{3,}$/;

let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let context: ReturnType<typeof testContext>;
let close: () => void;
let signResult: Awaited<ReturnType<typeof signOnce>>;

async function signOnce() {
  const bytes = await makeJpeg();
  const up = await call(
    appRouter.upload.create,
    { file: toFile(bytes, "o.jpg") },
    { context }
  );
  return await call(
    appRouter.sign.create,
    { originalFileId: up.fileId, claims: sampleClaims },
    { context }
  );
}

beforeAll(async () => {
  const t = await createTestDb();
  db = t.db;
  close = t.close;
  context = testContext(db);
  signResult = await signOnce();
});

afterAll(() => {
  close();
});

// task.md §11 #2 + #3 — manifest creation + record stored
it("signs and stores an evidence record with a manifest label and evidenceId", async () => {
  expect(signResult.evidenceId).toMatch(EVIDENCE_ID);
  expect(signResult.manifestLabel).toBeTruthy();
  expect(signResult.signatureStatus).toBe("valid");

  const rows = await db.select().from(evidenceRecords);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.evidenceId).toBe(signResult.evidenceId);
  expect(rows[0]?.signedFileHash).toBe(signResult.signedFileHash);
});

// task.md §11 #9 — malicious evidence text is stored as inert data, not executed
it("preserves malicious caption text verbatim as JSON data", async () => {
  const [row] = await db.select().from(evidenceRecords);
  const evidence = row?.extractedEvidenceJson as {
    journalism: { caption: string };
  };
  expect(evidence.journalism.caption).toBe("<script>alert(1)</script>");
});

// a crash inside the sign pipeline (here: missing original bytes on disk)
// surfaces as a typed TOOL_ERROR, never an opaque INTERNAL_SERVER_ERROR.
it("maps a sign-pipeline failure to TOOL_ERROR", async () => {
  const bytes = await makeJpeg();
  const up = await call(
    appRouter.upload.create,
    { file: toFile(bytes, "gone.jpg") },
    { context }
  );
  await rm(join(env.DATA_DIR, up.fileId));

  await expect(
    call(
      appRouter.sign.create,
      { originalFileId: up.fileId, claims: sampleClaims },
      { context }
    )
  ).rejects.toMatchObject({ code: "TOOL_ERROR" });
});

// task.md §11 #10 — the private signing key never reaches the DB or the API
it("never stores or returns the private signing key", async () => {
  const keyPem = await readFile(
    join(process.cwd(), "../../fixtures/dev-certs/es256_private.key"),
    "utf8"
  );
  const keyBody = keyPem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");

  const rows = await db.select().from(evidenceRecords);
  const haystack = JSON.stringify(rows) + JSON.stringify(signResult);
  expect(haystack).not.toContain(keyBody.slice(0, 48));
});
