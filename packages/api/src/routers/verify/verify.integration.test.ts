import { createTestDb } from "@c2pa-evidence-tamper-lab/db/testing";
import { call } from "@orpc/server";
import sharp from "sharp";
import { afterAll, beforeAll, expect, it } from "vitest";

import type { Evidence } from "../../evidence/schema";
import { signImage } from "../../integrations/c2pa";
import { sha256 } from "../../integrations/imaging";
import { storage } from "../../integrations/storage";
import { testContext } from "../../test-support/context";
import { makeJpeg, sampleClaims, toFile } from "../../test-support/fixtures";
import { appRouter } from "../index";

// A schema-valid evidence payload — callers mutate one field to make it invalid.
function validEvidence(evidenceId: string): Evidence {
  return {
    evidenceId,
    mode: "journalism",
    media: {
      sha256: "a".repeat(64),
      mimeType: "image/jpeg",
      fileSizeBytes: 1,
      width: 96,
      height: 72,
    },
    capture: {
      capturedAt: null,
      gps: null,
      cameraHeadingDegrees: null,
      cameraDirectionText: null,
    },
    journalism: {
      reporterId: "rep_1",
      organization: "Example Newsroom",
      sourceType: "staff_reporter",
      caption: "caption",
      publicInterestReason: "Newsworthy",
      safetyNotes: [],
    },
    inspection: null,
    integrity: {
      schemaVersion: "1.0",
      createdBy: "test",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

// Signs a JPEG with the given (possibly invalid) embedded evidence and stores
// it — bypassing sign.create so no evidence_records row is written. Lets us
// exercise the verify reason codes that depend on the embedded manifest alone.
// `mutate` byte-patches the signed file before storing (for the corrupt-manifest
// cases); `title` overrides the claim title needle for the signature case.
async function signWithEvidence(
  evidence: Evidence,
  opts: { title?: string; mutate?: (bytes: Buffer) => Buffer } = {}
): Promise<string> {
  const bytes = await makeJpeg();
  const signed = await signImage({
    bytes,
    mime: "image/jpeg",
    title: opts.title ?? evidence.evidenceId,
    evidence,
  });
  const out = opts.mutate
    ? opts.mutate(Buffer.from(signed.signedBytes))
    : signed.signedBytes;
  const row = await storage.storeFile(context.db, {
    bytes: out,
    kind: "signed",
    mime: "image/jpeg",
    sha256: sha256(out),
    sizeBytes: out.length,
    width: 96,
    height: 72,
  });
  return row.id;
}

// Flip a byte inside the claim-covered title text: the claim bytes change but
// stay valid CBOR, so the signature over the claim no longer verifies.
function flipTitleByte(needle: string) {
  return (b: Buffer): Buffer => {
    const i = b.indexOf(Buffer.from(needle));
    if (i < 0) {
      throw new Error("title needle not found in signed bytes");
    }
    // biome-ignore lint/suspicious/noBitwiseOperators: deliberate bit-flip to corrupt a signed byte
    b[i + 3] = (b[i + 3] ?? 0) ^ 0x01;
    return b;
  };
}

// Smash the CBOR just after the `c2pa.claim` JUMBF label: the c2pa bytes remain
// present but the claim no longer decodes, so the reader throws on parse.
function smashClaimCbor(b: Buffer): Buffer {
  const ci = b.indexOf(Buffer.from("c2pa.claim"));
  if (ci < 0) {
    throw new Error("c2pa.claim label not found in signed bytes");
  }
  for (let i = ci + 40; i < ci + 72; i++) {
    // biome-ignore lint/suspicious/noBitwiseOperators: deliberate bit-flip to smash claim CBOR
    b[i] = (b[i] ?? 0) ^ 0xff;
  }
  return b;
}

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

// task.md §6 — the manifest carries a valid evidenceId but no record exists for
// it (e.g. the record was never persisted / was deleted).
it("reports EVIDENCE_ID_NOT_FOUND_IN_DB when the manifest id has no record", async () => {
  const fileId = await signWithEvidence(validEvidence("ev_2026_900"));
  const res = await verifyFileId(fileId);

  expect(res.matchedEvidenceId).toBe("ev_2026_900");
  expect(res.matchedOriginalRecord).toBe(false);
  expect(res.reasonCodes).toContain("EVIDENCE_ID_NOT_FOUND_IN_DB");
  expect(res.reasonCodes).not.toContain("EVIDENCE_JSON_SCHEMA_INVALID");
});

// task.md §6 — the embedded evidence has a valid evidenceId but the full JSON
// fails the schema (here: media.width is non-positive).
it("reports EVIDENCE_JSON_SCHEMA_INVALID for a malformed evidence payload", async () => {
  const bad = validEvidence("ev_2026_901");
  bad.media.width = 0;
  const fileId = await signWithEvidence(bad);
  const res = await verifyFileId(fileId);

  expect(res.reasonCodes).toContain("EVIDENCE_JSON_SCHEMA_INVALID");
});

// task.md §6 — a manifest whose claim signature no longer matches (a claim-
// covered byte was altered after signing) classifies as tampered.
it("reports C2PA_SIGNATURE_INVALID when the claim signature is broken", async () => {
  const fileId = await signWithEvidence(validEvidence("ev_2026_902"), {
    title: "PROBESIGNATURENEEDLE",
    mutate: flipTitleByte("PROBESIGNATURENEEDLE"),
  });
  const res = await verifyFileId(fileId);

  expect(res.uploadedFileStatus).toBe("tampered");
  expect(res.reasonCodes).toContain("C2PA_SIGNATURE_INVALID");
});

// task.md §6 — c2pa bytes are present but the claim no longer parses, so the
// reader fails to build a manifest: manifest_invalid, not missing.
it("reports C2PA_MANIFEST_PARSE_FAILED when the manifest is present but unparseable", async () => {
  const fileId = await signWithEvidence(validEvidence("ev_2026_903"), {
    mutate: smashClaimCbor,
  });
  const res = await verifyFileId(fileId);

  expect(res.uploadedFileStatus).toBe("manifest_invalid");
  expect(res.reasonCodes).toContain("C2PA_MANIFEST_PARSE_FAILED");
});
