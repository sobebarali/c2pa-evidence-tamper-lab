import { publicProcedure } from "../../index";
import {
  extractMetadata,
  sha256,
  type TamperMethod,
  tamper,
} from "../../integrations/imaging";
import { storage } from "../../integrations/storage";
import { routerError } from "../_shared/errors";
import { tamperInput, tamperOutput } from "./schema";

// Step 5 — produce a tampered copy of a signed image. `strip` removes the
// manifest (→ verify: manifest_missing); `pixel` patches the scan (→ tampered).
const create = publicProcedure
  .errors({ NOT_FOUND: {}, TOOL_ERROR: {} })
  .input(tamperInput)
  .output(tamperOutput)
  .handler(async ({ input, context }) => {
    const signed = await storage.getFileRow(context.db, input.signedFileId);
    if (signed?.kind !== "signed") {
      throw routerError("NOT_FOUND", { message: "signed file not found" });
    }

    const bytes = await storage.readBytes(signed.id);
    let tamperedBytes: Buffer;
    try {
      tamperedBytes = await tamper(bytes, input.method as TamperMethod);
    } catch (cause) {
      throw routerError("TOOL_ERROR", { message: "tamper failed", cause });
    }

    const hash = sha256(tamperedBytes);
    const meta = await extractMetadata(tamperedBytes).catch(() => null);
    const row = await storage.storeFile(context.db, {
      bytes: tamperedBytes,
      kind: "tampered",
      mime: signed.mime,
      sha256: hash,
      sizeBytes: tamperedBytes.length,
      width: meta?.width ?? signed.width,
      height: meta?.height ?? signed.height,
    });

    return { tamperedFileId: row.id, sha256: hash, method: input.method };
  });

export const tamperRouter = { create };
