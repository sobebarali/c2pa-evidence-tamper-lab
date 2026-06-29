import { z } from "zod";

import { evidenceClaimsSchema } from "../../evidence/schema";

export const signInput = z.object({
  originalFileId: z.string().min(1),
  claims: evidenceClaimsSchema,
});

export const signOutput = z.object({
  evidenceId: z.string(),
  signedFileId: z.string(),
  signedFileHash: z.string(),
  manifestLabel: z.string().nullable(),
  signatureStatus: z.enum(["valid", "invalid", "unknown"]),
});

export type SignOutput = z.infer<typeof signOutput>;
