import { z } from "zod";

export const recordView = z.object({
  evidenceId: z.string(),
  mode: z.enum(["journalism", "inspection"]),
  originalFileId: z.string(),
  signedFileId: z.string(),
  originalFileHash: z.string(),
  signedFileHash: z.string(),
  manifestLabel: z.string().nullable(),
  claimGenerator: z.string().nullable(),
  signatureStatus: z.enum(["valid", "invalid", "unknown"]),
  validationErrors: z.array(z.string()),
  extractedEvidenceJson: z.record(z.string(), z.unknown()),
  // C2PA 2.4 repository-receipt (modeled in-store).
  repositoryReceipt: z
    .object({
      ingestedAt: z.iso.datetime(),
      manifestLabel: z.string().nullable(),
      repository: z.string(),
      signedFileHash: z.string(),
    })
    .nullable(),
  createdAt: z.iso.datetime(),
});

export const listOutput = z.object({ items: z.array(recordView) });

export const getInput = z.object({ evidenceId: z.string().min(1) });

export type RecordView = z.infer<typeof recordView>;
