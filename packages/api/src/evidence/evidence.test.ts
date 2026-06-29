import { describe, expect, it } from "vitest";

import { buildEvidence, formatEvidenceId } from "./build";
import { evidenceClaimsSchema, evidenceSchema, type Media } from "./schema";

const media: Media = {
  sha256: "a".repeat(64),
  mimeType: "image/jpeg",
  fileSizeBytes: 1000,
  width: 64,
  height: 64,
};

const journalismClaims = {
  mode: "journalism" as const,
  capture: {
    capturedAt: "2026-06-27T10:30:00Z",
    gps: {
      lat: 25.2,
      lng: 55.27,
      source: "exif" as const,
      confidence: "high" as const,
    },
    cameraHeadingDegrees: 90,
    cameraDirectionText: "east",
  },
  journalism: {
    reporterId: "rep_1",
    organization: "Example Newsroom",
    sourceType: "staff_reporter",
    caption: "Street scene",
    publicInterestReason: "Newsworthy",
    safetyNotes: ["Do not reveal exact GPS"],
  },
};

describe("evidence schema", () => {
  it("accepts valid journalism claims", () => {
    expect(evidenceClaimsSchema.safeParse(journalismClaims).success).toBe(true);
  });

  it("rejects an out-of-range gps latitude", () => {
    const bad = {
      ...journalismClaims,
      capture: {
        ...journalismClaims.capture,
        gps: { lat: 999, lng: 0, source: "user", confidence: "low" },
      },
    };
    expect(evidenceClaimsSchema.safeParse(bad).success).toBe(false);
  });

  it("honours missing EXIF/GPS as null, not invalid", () => {
    const noExif = {
      ...journalismClaims,
      capture: {
        capturedAt: null,
        gps: null,
        cameraHeadingDegrees: null,
        cameraDirectionText: null,
      },
    };
    expect(evidenceClaimsSchema.safeParse(noExif).success).toBe(true);
  });

  it("formatEvidenceId zero-pads the sequence", () => {
    expect(formatEvidenceId(2026, 1)).toBe("ev_2026_001");
  });

  it("buildEvidence produces a schema-valid canonical record", () => {
    const evidence = buildEvidence({
      evidenceId: "ev_2026_001",
      media,
      claims: journalismClaims,
      createdAt: "2026-06-27T10:35:00Z",
    });
    expect(evidence.inspection).toBeNull();
    expect(evidenceSchema.safeParse(evidence).success).toBe(true);
  });
});
