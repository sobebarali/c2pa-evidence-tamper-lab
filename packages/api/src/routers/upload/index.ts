import { env } from "@c2pa-evidence-tamper-lab/env/server";
import { publicProcedure } from "../../index";
import { extractMetadata, sha256 } from "../../integrations/imaging";
import { storage } from "../../integrations/storage";
import { routerError } from "../_shared/errors";
import { uploadInput, uploadOutput } from "./schema";

const SUPPORTED = new Set(["image/jpeg", "image/png"]);

// Step 1 — accept an original image, derive file facts honestly, store it.
const create = publicProcedure
  .errors({
    BAD_REQUEST: {},
    PAYLOAD_TOO_LARGE: {},
    TOOL_ERROR: {},
    UNSUPPORTED_MEDIA_TYPE: {},
  })
  .input(uploadInput)
  .output(uploadOutput)
  .handler(async ({ input, context }) => {
    const bytes = Buffer.from(await input.file.arrayBuffer());
    if (bytes.length > env.MAX_UPLOAD_BYTES) {
      throw routerError("PAYLOAD_TOO_LARGE");
    }

    // Detected mime is authoritative — never trust the client's content-type.
    const meta = await extractMetadata(bytes).catch(() => null);
    if (!meta) {
      throw routerError("BAD_REQUEST", {
        message: "file is not a readable image",
      });
    }
    if (!SUPPORTED.has(meta.mime)) {
      throw routerError("UNSUPPORTED_MEDIA_TYPE");
    }

    const mimeType = meta.mime as "image/jpeg" | "image/png";
    const hash = sha256(bytes);
    // Validation (typed errors) is done; the DB/disk write is infra — map a
    // crash here (schema drift, disk failure) to TOOL_ERROR, never a bare 500.
    let row: Awaited<ReturnType<typeof storage.storeFile>>;
    try {
      row = await storage.storeFile(context.db, {
        bytes,
        kind: "original",
        mime: mimeType,
        sha256: hash,
        sizeBytes: bytes.length,
        width: meta.width,
        height: meta.height,
      });
    } catch (cause) {
      throw routerError("TOOL_ERROR", {
        message: "failed to store file",
        cause,
      });
    }

    return {
      fileId: row.id,
      media: {
        sha256: hash,
        mimeType,
        fileSizeBytes: bytes.length,
        width: meta.width,
        height: meta.height,
      },
      capture: { capturedAt: meta.capturedAt, gps: meta.gps },
    };
  });

export const uploadRouter = { create };
