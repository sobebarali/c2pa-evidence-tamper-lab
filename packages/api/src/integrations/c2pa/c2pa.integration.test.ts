import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";

import { buildEvidence } from "../../evidence/build";
import type { Media } from "../../evidence/schema";
import { sha256, tamper } from "../imaging";
import { classify, readManifest, signImage } from "./index";

const MIME = "image/jpeg";
let signed: Buffer;

function recoveredEvidenceId(evidence: unknown): string | undefined {
  return (evidence as { evidenceId?: string } | null)?.evidenceId;
}

beforeAll(async () => {
  const img = await sharp({
    create: {
      width: 320,
      height: 240,
      channels: 3,
      background: { r: 20, g: 140, b: 90 },
    },
  })
    .jpeg()
    .toBuffer();

  const media: Media = {
    sha256: sha256(img),
    mimeType: "image/jpeg",
    fileSizeBytes: img.length,
    width: 320,
    height: 240,
  };
  const evidence = buildEvidence({
    evidenceId: "ev_2026_001",
    media,
    createdAt: "2026-06-27T10:35:00Z",
    claims: {
      mode: "journalism",
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
        caption: "Street scene",
        publicInterestReason: "Newsworthy",
        safetyNotes: [],
      },
    },
  });

  const res = await signImage({
    bytes: img,
    mime: MIME,
    title: "test.jpg",
    evidence,
  });
  expect(res.signatureStatus).toBe("valid");
  signed = res.signedBytes;
});

describe("c2pa integration (real signing)", () => {
  it("verifies a freshly signed image and recovers the evidenceId", async () => {
    const read = await readManifest(signed, MIME);
    expect(classify(read).status).toBe("verified");
    expect(recoveredEvidenceId(read.evidence)).toBe("ev_2026_001");
  });

  it("flags a pixel-tampered image as tampered, evidenceId recoverable", async () => {
    const tampered = await tamper(signed, "pixel");
    const read = await readManifest(tampered, MIME);
    const result = classify(read);
    expect(result.status).toBe("tampered");
    expect(result.reasonCodes).toContain("HASH_ASSERTION_MISMATCH");
    expect(recoveredEvidenceId(read.evidence)).toBe("ev_2026_001");
  });

  it("reports a stripped image as manifest_missing", async () => {
    const stripped = await tamper(signed, "strip");
    const read = await readManifest(stripped, MIME);
    expect(classify(read).status).toBe("manifest_missing");
  });
});

// CET-253 — classify() prefers the v2 validation surface. A v2 asset reports
// Invalid via validation_state even when the legacy validation_status is empty.
describe("classify (v2 validation surface)", () => {
  const base = {
    claimGenerator: "x",
    evidence: null,
    hasC2paBytes: true,
    hasIdentity: false,
    hasManifest: true,
    identitySignerName: null,
    manifestLabel: "m",
    parseFailed: false,
    validationResults: null,
    validationStatus: [],
  };

  it("marks a v2 Invalid state as tampered with empty legacy status", () => {
    const result = classify({ ...base, validationState: "Invalid" });
    expect(result.status).toBe("tampered");
  });

  it("treats a v2 Valid state as verified (untrusted in dev)", () => {
    const result = classify({ ...base, validationState: "Valid" });
    expect(result.status).toBe("verified");
    expect(result.reasonCodes).toContain("C2PA_TRUST_UNVERIFIED");
  });

  it("drops the trust-unverified code when the state is Trusted", () => {
    const result = classify({ ...base, validationState: "Trusted" });
    expect(result.status).toBe("verified");
    expect(result.reasonCodes).not.toContain("C2PA_TRUST_UNVERIFIED");
  });
});
