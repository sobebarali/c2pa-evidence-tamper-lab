import { z } from "zod";

export const verifyInput = z.object({
  file: z.instanceof(File),
});

export const verifyOutput = z.object({
  uploadedFileId: z.string(),
  uploadedFileStatus: z.enum([
    "verified",
    "tampered",
    "manifest_missing",
    "manifest_invalid",
    "unknown",
  ]),
  matchedEvidenceId: z.string().nullable(),
  matchedOriginalRecord: z.boolean(),
  reasonCodes: z.array(z.string()),
  uploadedFileHash: z.string(),
  originalSignedFileHash: z.string().nullable(),
  message: z.string(),
  // C2PA v2 structured validation surface (supplementary to reasonCodes).
  // crJSON is reserved — not emitted by @contentauth/c2pa-node 0.6.0.
  report: z
    .object({
      validationState: z.enum(["Invalid", "Valid", "Trusted"]).nullable(),
      validationResults: z.unknown().nullable(),
    })
    .nullable(),
  // CAWG identity assertion: the "who" bound into the manifest.
  identity: z.object({
    present: z.boolean(),
    signerName: z.string().nullable(),
  }),
});

export type VerifyOutput = z.infer<typeof verifyOutput>;
