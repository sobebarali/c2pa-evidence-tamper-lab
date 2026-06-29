import type { Db } from "@c2pa-evidence-tamper-lab/db";
import { evidenceRecords } from "@c2pa-evidence-tamper-lab/db";
import { env } from "@c2pa-evidence-tamper-lab/env/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { evidenceIdSchema, evidenceSchema } from "../../evidence/schema";
import { publicProcedure } from "../../index";
import type { ReadResult } from "../../integrations/c2pa";
import { classify, readManifest } from "../../integrations/c2pa";
import {
  extractMetadata,
  hammingDistance,
  perceptualHash,
  sha256,
} from "../../integrations/imaging";
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

// Finds the nearest stored record by perceptual fingerprint within the configured
// Hamming threshold. Returns null when nothing is close enough — a stricter bar
// than "least distant" so unrelated images don't get falsely linked.
async function matchBySoftBinding(
  db: Db,
  bytes: Buffer
): Promise<{ evidenceId: string; signedFileHash: string } | null> {
  const uploadedFingerprint = await perceptualHash(bytes);
  const records = await db.select().from(evidenceRecords);
  let best: { evidenceId: string; signedFileHash: string } | null = null;
  let bestDistance = env.FINGERPRINT_MAX_DISTANCE + 1;
  for (const record of records) {
    if (!record.fingerprint) {
      continue;
    }
    const distance = hammingDistance(uploadedFingerprint, record.fingerprint);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = {
        evidenceId: record.evidenceId,
        signedFileHash: record.signedFileHash,
      };
    }
  }
  return bestDistance <= env.FINGERPRINT_MAX_DISTANCE ? best : null;
}

// Reason code for the CAWG identity binding, or null when no identity assertion
// is present.
function identityReasonCode(read: ReadResult): string | null {
  if (!read.hasIdentity) {
    return null;
  }
  const failed = (read.validationResults?.activeManifest?.failure ?? []).some(
    (s) => {
      const code = s.code.toLowerCase();
      return code.includes("cawg") || code.includes("identity");
    }
  );
  return failed ? "CAWG_IDENTITY_INVALID" : "CAWG_IDENTITY_PRESENT";
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

      const identityReason = identityReasonCode(read);
      if (identityReason) {
        reasonCodes.push(identityReason);
      }

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

      // Soft-binding fallback: the manifest gave us no usable evidenceId (e.g.
      // it was stripped). Recover the link via perceptual fingerprint. The DB is
      // not cryptographic truth — this match is advisory, so the status stays
      // whatever the C2PA verifier decided (typically manifest_missing).
      let matchedBySoftBinding = false;
      if (!matchedEvidenceId) {
        const match = await matchBySoftBinding(context.db, bytes);
        if (match) {
          matchedEvidenceId = match.evidenceId;
          matchedOriginalRecord = true;
          originalSignedFileHash = match.signedFileHash;
          matchedBySoftBinding = true;
          reasonCodes.push("MATCHED_BY_SOFT_BINDING");
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
        message: matchedBySoftBinding
          ? "No valid C2PA manifest links this file, but it perceptually matches a signed Original Pictures evidence record (soft binding — not a cryptographic guarantee)."
          : messageFor(classification.status, matchedOriginalRecord),
        report: {
          validationState: read.validationState,
          validationResults: read.validationResults,
        },
        identity: {
          present: read.hasIdentity,
          signerName: read.identitySignerName,
        },
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
        report: null,
        identity: { present: false, signerName: null },
      };
    }
  });

export const verifyRouter = { check };
