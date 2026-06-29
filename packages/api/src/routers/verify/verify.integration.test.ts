import { createTestDb } from "@c2pa-evidence-tamper-lab/db/testing";
import { call } from "@orpc/server";
import sharp from "sharp";
import { afterAll, beforeAll, expect, it } from "vitest";

import { storage } from "../../integrations/storage";
import { testContext } from "../../test-support/context";
import { makeJpeg, sampleClaims, toFile } from "../../test-support/fixtures";
import { appRouter } from "../index";

let context: ReturnType<typeof testContext>;
let close: () => void;
let evidenceId: string;
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
  evidenceId = signed.evidenceId;
  signedFileId = signed.signedFileId;
});

afterAll(() => {
  close();
});

async function verifyFileId(fileId: string) {
  const bytes = await storage.readBytes(fileId);
  return await call(
    appRouter.verify.check,
    { file: toFile(bytes, "u.jpg") },
    { context }
  );
}

// task.md §11 #4 + #5 — valid signed image verifies, evidenceId recovered + matched
it("verifies a valid signed image and links it to the original record", async () => {
  const res = await verifyFileId(signedFileId);
  expect(res.uploadedFileStatus).toBe("verified");
  expect(res.matchedEvidenceId).toBe(evidenceId);
  expect(res.matchedOriginalRecord).toBe(true);
  expect(res.reasonCodes).toContain("MATCHED_PRIOR_EVIDENCE_RECORD");
  // CET-255 — CAWG-shaped identity binding is present and bound to the org.
  expect(res.identity.present).toBe(true);
  expect(res.identity.signerName).toBe("Example Newsroom");
  expect(res.reasonCodes).toContain("CAWG_IDENTITY_PRESENT");
  // CET-253 — v2 validation surface is exposed.
  expect(res.report?.validationState).toBe("Valid");
});

// task.md §11 #6 + #7 — pixel-tampered image is NOT verified, still links back
it("flags a pixel-tampered image as tampered and links it back", async () => {
  const tampered = await call(
    appRouter.tamper.create,
    { signedFileId, method: "pixel" },
    { context }
  );
  const res = await verifyFileId(tampered.tamperedFileId);

  expect(res.uploadedFileStatus).toBe("tampered");
  expect(res.uploadedFileStatus).not.toBe("verified");
  expect(res.matchedEvidenceId).toBe(evidenceId);
  expect(res.matchedOriginalRecord).toBe(true);
  expect(res.reasonCodes).toContain("HASH_ASSERTION_MISMATCH");
  expect(res.originalSignedFileHash).not.toBe(res.uploadedFileHash);
});

// task.md §11 #8 — manifest-stripped image stays manifest_missing (crypto truth),
// but CET-254 soft binding recovers the evidenceId via perceptual fingerprint.
it("links a stripped image back to its record via soft binding", async () => {
  const stripped = await call(
    appRouter.tamper.create,
    { signedFileId, method: "strip" },
    { context }
  );
  const res = await verifyFileId(stripped.tamperedFileId);

  expect(res.uploadedFileStatus).toBe("manifest_missing");
  expect(res.reasonCodes).toContain("C2PA_MANIFEST_MISSING");
  expect(res.reasonCodes).toContain("MATCHED_BY_SOFT_BINDING");
  expect(res.matchedEvidenceId).toBe(evidenceId);
  expect(res.matchedOriginalRecord).toBe(true);
});

// An unrelated unsigned image must NOT be falsely linked by the soft binding.
it("reports an unrelated unsigned image as manifest_missing with no link", async () => {
  // Textured (non-degenerate) image so its fingerprint is far from the signed one.
  const pattern = Buffer.alloc(96 * 72 * 3);
  for (let i = 0; i < pattern.length; i++) {
    pattern[i] = (i * 73) % 256;
  }
  const unrelated = await sharp(pattern, {
    raw: { width: 96, height: 72, channels: 3 },
  })
    .jpeg()
    .toBuffer();

  const res = await call(
    appRouter.verify.check,
    { file: toFile(unrelated, "unrelated.jpg") },
    { context }
  );

  expect(res.uploadedFileStatus).toBe("manifest_missing");
  expect(res.matchedEvidenceId).toBeNull();
  expect(res.matchedOriginalRecord).toBe(false);
  expect(res.reasonCodes).toContain("C2PA_MANIFEST_MISSING");
  expect(res.reasonCodes).not.toContain("MATCHED_BY_SOFT_BINDING");
});
