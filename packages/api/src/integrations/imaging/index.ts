import { createHash } from "node:crypto";

import exifr from "exifr";
import sharp from "sharp";

const JPEG_SOS_MARKER_FIRST = 0xff;
const JPEG_SOS_MARKER_SECOND = 0xda;
const PIXEL_PATCH_OFFSET = 200;
const PIXEL_PATCH_LENGTH = 8;

export interface ImageMetadata {
  capturedAt: string | null;
  gps: { lat: number; lng: number } | null;
  height: number;
  mime: string;
  sizeBytes: number;
  width: number;
}

export type TamperMethod = "strip" | "pixel";

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// Reads dimensions/mime from the header (sharp) and EXIF timestamp + GPS
// (exifr). Missing EXIF/GPS degrades to null — absence is honest, not invalid.
export async function extractMetadata(bytes: Buffer): Promise<ImageMetadata> {
  const meta = await sharp(bytes).metadata();
  const exif = await exifr.parse(bytes).catch(() => null);
  const gps = await exifr.gps(bytes).catch(() => null);

  const capturedAt =
    exif?.DateTimeOriginal instanceof Date
      ? exif.DateTimeOriginal.toISOString()
      : null;

  return {
    mime: meta.format ? `image/${meta.format}` : "application/octet-stream",
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    sizeBytes: bytes.length,
    capturedAt,
    gps:
      gps &&
      typeof gps.latitude === "number" &&
      typeof gps.longitude === "number"
        ? { lat: gps.latitude, lng: gps.longitude }
        : null,
  };
}

// Two tamper modes (task.md §5):
//   strip  → sharp re-encode drops the C2PA manifest → verify: manifest_missing
//   pixel  → byte-patch the JPEG scan data, leaving the manifest bytes intact →
//            verify: tampered (content hash mismatch), evidenceId still recoverable
export async function tamper(
  bytes: Buffer,
  method: TamperMethod
): Promise<Buffer> {
  if (method === "strip") {
    return await sharp(bytes).toBuffer();
  }
  return pixelPatch(bytes);
}

function pixelPatch(bytes: Buffer): Buffer {
  const out = Buffer.from(bytes);
  let sos = -1;
  for (let i = 2; i < out.length - 1; i++) {
    if (
      out[i] === JPEG_SOS_MARKER_FIRST &&
      out[i + 1] === JPEG_SOS_MARKER_SECOND
    ) {
      sos = i;
      break;
    }
  }
  if (sos === -1) {
    throw new Error("no JPEG scan segment found to tamper");
  }
  // ponytail: flip bytes just inside the entropy-coded scan; preserves the
  // C2PA APP11 segment so the manifest still reads (→ hash mismatch, not
  // missing). Heuristic offset — fine for the lab; a content-aware patch is the
  // upgrade path.
  const start = Math.min(
    sos + PIXEL_PATCH_OFFSET,
    out.length - PIXEL_PATCH_LENGTH
  );
  for (let i = 0; i < PIXEL_PATCH_LENGTH; i++) {
    // biome-ignore lint/suspicious/noBitwiseOperators: flipping scan bytes is the point of pixel tampering
    out.writeUInt8(out.readUInt8(start + i) ^ 0xff, start + i);
  }
  return out;
}
