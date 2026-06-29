import { rm } from "node:fs/promises";
import { join } from "node:path";

import { createTestDb } from "@c2pa-evidence-tamper-lab/db/testing";
import { env } from "@c2pa-evidence-tamper-lab/env/server";
import { call } from "@orpc/server";
import { afterAll, beforeAll, expect, it } from "vitest";

import { testContext } from "../../test-support/context";
import { makeJpeg, sampleClaims, toFile } from "../../test-support/fixtures";
import { appRouter } from "../index";

let context: ReturnType<typeof testContext>;
let close: () => void;
let signedFileId: string;

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
  signedFileId = signed.signedFileId;
});

afterAll(() => {
  close();
});

it("returns NOT_FOUND for an unknown signed file", async () => {
  await expect(
    call(
      appRouter.tamper.create,
      { signedFileId: "does-not-exist", method: "pixel" },
      { context }
    )
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

// A crash inside the tamper pipeline (here: the signed bytes are gone from
// disk) surfaces as a typed TOOL_ERROR, never an opaque INTERNAL_SERVER_ERROR.
it("maps a tamper-pipeline failure to TOOL_ERROR", async () => {
  await rm(join(env.DATA_DIR, signedFileId));

  await expect(
    call(
      appRouter.tamper.create,
      { signedFileId, method: "pixel" },
      { context }
    )
  ).rejects.toMatchObject({ code: "TOOL_ERROR" });
});
