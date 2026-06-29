import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";

import { extractMetadata, sha256, tamper } from "./index";

const HEX64 = /^[0-9a-f]{64}$/;
let jpeg: Buffer;

beforeAll(async () => {
  jpeg = await sharp({
    create: {
      width: 48,
      height: 32,
      channels: 3,
      background: { r: 1, g: 2, b: 3 },
    },
  })
    .jpeg()
    .toBuffer();
});

describe("imaging", () => {
  it("derives dimensions + mime and honest null EXIF/GPS", async () => {
    const meta = await extractMetadata(jpeg);
    expect(meta.width).toBe(48);
    expect(meta.height).toBe(32);
    expect(meta.mime).toBe("image/jpeg");
    expect(meta.capturedAt).toBeNull();
    expect(meta.gps).toBeNull();
  });

  it("sha256 returns stable 64-char hex", () => {
    expect(sha256(jpeg)).toMatch(HEX64);
    expect(sha256(jpeg)).toBe(sha256(jpeg));
  });

  it("strip tamper re-encodes to a buffer", async () => {
    const stripped = await tamper(jpeg, "strip");
    expect(Buffer.isBuffer(stripped)).toBe(true);
    expect(stripped.length).toBeGreaterThan(0);
  });

  it("pixel tamper keeps the byte length and changes content", async () => {
    const patched = await tamper(jpeg, "pixel");
    expect(patched.length).toBe(jpeg.length);
    expect(patched.equals(jpeg)).toBe(false);
  });
});
