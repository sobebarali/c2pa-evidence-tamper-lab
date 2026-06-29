import { createTestDb } from "@c2pa-evidence-tamper-lab/db/testing";
import { call } from "@orpc/server";
import { afterAll, beforeAll, expect, it } from "vitest";

import { testContext } from "../../test-support/context";
import { makeJpeg, toFile } from "../../test-support/fixtures";
import { appRouter } from "../index";

const SHA256_HEX = /^[0-9a-f]{64}$/;

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

it("uploads an image and returns honest file facts", async () => {
  const bytes = await makeJpeg(80, 60);
  const res = await call(
    appRouter.upload.create,
    { file: toFile(bytes, "o.jpg") },
    { context }
  );

  expect(res.fileId).toBeTruthy();
  expect(res.media.mimeType).toBe("image/jpeg");
  expect(res.media.width).toBe(80);
  expect(res.media.height).toBe(60);
  expect(res.media.sha256).toMatch(SHA256_HEX);
  // no EXIF in a generated image — represented honestly, not as invalid
  expect(res.capture.capturedAt).toBeNull();
  expect(res.capture.gps).toBeNull();
});

it("rejects a non-image with BAD_REQUEST", async () => {
  const file = toFile(Buffer.from("definitely not an image"), "x.jpg");
  await expect(
    call(appRouter.upload.create, { file }, { context })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});
