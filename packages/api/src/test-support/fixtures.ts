import sharp from "sharp";

import type { EvidenceClaims } from "../evidence/schema";

export function makeJpeg(width = 96, height = 72): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 12, g: 90, b: 160 },
    },
  })
    .jpeg()
    .toBuffer();
}

export function toFile(
  bytes: Buffer,
  name = "image.jpg",
  type = "image/jpeg"
): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

export const sampleClaims: EvidenceClaims = {
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
    caption: "<script>alert(1)</script>",
    publicInterestReason: "Newsworthy event documentation",
    safetyNotes: ["Do not reveal exact GPS publicly"],
  },
};
