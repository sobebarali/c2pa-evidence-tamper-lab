import { z } from "zod";

export const tamperInput = z.object({
  signedFileId: z.string().min(1),
  method: z.enum(["strip", "pixel"]),
});

export const tamperOutput = z.object({
  tamperedFileId: z.string(),
  sha256: z.string(),
  method: z.enum(["strip", "pixel"]),
});

export type TamperOutput = z.infer<typeof tamperOutput>;
