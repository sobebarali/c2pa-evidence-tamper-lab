import { evidenceRecords } from "@c2pa-evidence-tamper-lab/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { evidenceIdSchema, evidenceSchema } from "../../evidence/schema";
import { publicProcedure } from "../../index";
import { classify, readManifest } from "../../integrations/c2pa";
import { extractMetadata, sha256 } from "../../integrations/imaging";
import { storage } from "../../integrations/storage";
import type { VerifyOutput } from "./schema";
import { verifyInput, verifyOutput } from "./schema";

const idOnlySchema = z.object({ evidenceId: evidenceIdSchema });

function messageFor(
  status: VerifyOutput["uploadedFileStatus"],
  matched: boolean
): string {
  if (status === "verified") {
    return "Valid Content Credentials. This file matches a signed Original Pictures evidence record.";
  }
  if (status === "tampered") {
    return matched
      ? "This file appears to be derived from a previously signed Original Pictures evidence record, but the signed content no longer matches."
      : "This file carries a C2PA manifest but the signed content no longer matches; no prior evidence record was found.";
  }
  if (status === "manifest_missing") {
    return "No C2PA manifest was found. The file cannot be linked to a signed Original Pictures evidence record.";
  }
  if (status === "manifest_invalid") {
    return "A C2PA manifest is present but could not be validated or parsed.";
  }
  return "The file could not be confidently classified.";
}

// Step 6 — read + verify an uploaded image, classify it, recover the evidenceId,
// and link it back to a prior record. A tampered/unsigned image is a SUCCESSFUL
// result (status in the body), never an error.
const check = publicProcedure
  .input(verifyInput)
  .output(verifyOutput)
  .handler(async ({ input, context }) => {
    const bytes = Buffer.from(await input.file.arrayBuffer());
    const uploadedFileHash = sha256(bytes);
    const meta = await extractMetadata(bytes).catch(() => null);
    const mime = meta?.mime ?? input.file.type ?? "image/jpeg";

    const uploaded = await storage.storeFile(context.db, {
      bytes,
      kind: "uploaded",
      mime,
      sha256: uploadedFileHash,
      sizeBytes: bytes.length,
      width: meta?.width ?? null,
      height: meta?.height ?? null,
    });

    try {
      const read = await readManifest(bytes, mime);
      const classification = classify(read);
      const reasonCodes = [...classification.reasonCodes];

      let matchedEvidenceId: string | null = null;
      let matchedOriginalRecord = false;
      let originalSignedFileHash: string | null = null;

      if (read.evidence && typeof read.evidence === "object") {
        const idOnly = idOnlySchema.safeParse(read.evidence);
        if (idOnly.success) {
          matchedEvidenceId = idOnly.data.evidenceId;
        }
        if (!evidenceSchema.safeParse(read.evidence).success) {
          reasonCodes.push("EVIDENCE_JSON_SCHEMA_INVALID");
        }
      }

      if (matchedEvidenceId) {
        const [record] = await context.db
          .select()
          .from(evidenceRecords)
          .where(eq(evidenceRecords.evidenceId, matchedEvidenceId));
        if (record) {
          matchedOriginalRecord = true;
          originalSignedFileHash = record.signedFileHash;
          reasonCodes.push("MATCHED_PRIOR_EVIDENCE_RECORD");
        } else {
          reasonCodes.push("EVIDENCE_ID_NOT_FOUND_IN_DB");
        }
      }

      return {
        uploadedFileId: uploaded.id,
        uploadedFileStatus: classification.status,
        matchedEvidenceId,
        matchedOriginalRecord,
        reasonCodes,
        uploadedFileHash,
        originalSignedFileHash,
        message: messageFor(classification.status, matchedOriginalRecord),
      };
    } catch {
      // The C2PA verifier failed unexpectedly (task.md §6) — return `unknown`
      // rather than throwing; the file is still stored and addressable.
      return {
        uploadedFileId: uploaded.id,
        uploadedFileStatus: "unknown" as const,
        matchedEvidenceId: null,
        matchedOriginalRecord: false,
        reasonCodes: ["C2PA_VERIFIER_ERROR"],
        uploadedFileHash,
        originalSignedFileHash: null,
        message: messageFor("unknown", false),
      };
    }
  });

export const verifyRouter = { check };
