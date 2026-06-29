import { z } from "zod";

// Canonical evidence JSON (task.md §4). Fields are grouped by trust:
//   media     — file-derived facts (server computes; never trusted from client)
//   capture   — inferred/user-provided (capturedAt/gps may come from EXIF or user)
//   journalism/inspection — user-entered CLAIMS (untrusted; validated + bounded here)
//   integrity — system-stamped

export const gpsSourceSchema = z.enum(["exif", "user", "unknown"]);
export const confidenceSchema = z.enum(["high", "medium", "low"]);

export const gpsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  source: gpsSourceSchema,
  confidence: confidenceSchema,
});

export const captureSchema = z.object({
  capturedAt: z.iso.datetime().nullable(),
  gps: gpsSchema.nullable(),
  cameraHeadingDegrees: z.number().min(0).max(360).nullable(),
  cameraDirectionText: z.string().max(120).nullable(),
});

export const mediaSchema = z.object({
  sha256: z.string().length(64),
  mimeType: z.enum(["image/jpeg", "image/png"]),
  fileSizeBytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const journalismSchema = z.object({
  reporterId: z.string().max(120),
  organization: z.string().max(200),
  sourceType: z.string().max(60),
  caption: z.string().max(2000),
  publicInterestReason: z.string().max(2000),
  safetyNotes: z.array(z.string().max(500)).max(50),
});

export const inspectionSchema = z.object({
  inspectionId: z.string().max(120),
  claimId: z.string().max(120),
  inspectorId: z.string().max(120),
  assetId: z.string().max(120),
  damageType: z.string().max(120),
  observation: z.string().max(2000),
  mapRequired: z.boolean(),
});

export const integritySchema = z.object({
  schemaVersion: z.literal("1.0"),
  createdBy: z.string(),
  createdAt: z.iso.datetime(),
});

export const evidenceIdSchema = z.string().regex(/^ev_\d{4}_\d{3,}$/);

// The user-editable draft — the sign-router input AND the web form schema.
// No media/evidenceId/integrity (those are server-authoritative).
export const evidenceClaimsSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("journalism"),
    capture: captureSchema,
    journalism: journalismSchema,
  }),
  z.object({
    mode: z.literal("inspection"),
    capture: captureSchema,
    inspection: inspectionSchema,
  }),
]);

// The full canonical evidence JSON that gets embedded in the C2PA assertion and
// validated again when parsed back on verify.
export const evidenceSchema = z.discriminatedUnion("mode", [
  z.object({
    evidenceId: evidenceIdSchema,
    mode: z.literal("journalism"),
    media: mediaSchema,
    capture: captureSchema,
    journalism: journalismSchema,
    inspection: z.null(),
    integrity: integritySchema,
  }),
  z.object({
    evidenceId: evidenceIdSchema,
    mode: z.literal("inspection"),
    media: mediaSchema,
    capture: captureSchema,
    journalism: z.null(),
    inspection: inspectionSchema,
    integrity: integritySchema,
  }),
]);

export type Gps = z.infer<typeof gpsSchema>;
export type Capture = z.infer<typeof captureSchema>;
export type Media = z.infer<typeof mediaSchema>;
export type EvidenceClaims = z.infer<typeof evidenceClaimsSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type EvidenceMode = Evidence["mode"];
