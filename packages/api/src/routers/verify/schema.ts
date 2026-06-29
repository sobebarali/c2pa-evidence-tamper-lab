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
});

export type VerifyOutput = z.infer<typeof verifyOutput>;
