import { z } from "zod";

import { mediaSchema } from "../../evidence/schema";

export const uploadInput = z.object({
  file: z.instanceof(File),
});

export const uploadOutput = z.object({
  fileId: z.string(),
  media: mediaSchema,
  capture: z.object({
    capturedAt: z.iso.datetime().nullable(),
    gps: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  }),
});

export type UploadOutput = z.infer<typeof uploadOutput>;
