import { evidenceRecords } from "@c2pa-evidence-tamper-lab/db";

import { buildEvidence, formatEvidenceId } from "../../evidence/build";
import { evidenceSchema, type Media } from "../../evidence/schema";
import { publicProcedure } from "../../index";
import { signImage } from "../../integrations/c2pa";
import { perceptualHash, sha256 } from "../../integrations/imaging";
import { storage } from "../../integrations/storage";
import { routerError } from "../_shared/errors";
import { signInput, signOutput } from "./schema";

// Steps 2–4 — build the manifest from the evidence JSON, sign the original,
// extract the manifest back, and store the evidence record.
const create = publicProcedure
  .errors({ NOT_FOUND: {}, TOOL_ERROR: {} })
  .input(signInput)
  .output(signOutput)
  .handler(async ({ input, context }) => {
    const original = await storage.getFileRow(context.db, input.originalFileId);
    if (original?.kind !== "original") {
      throw routerError("NOT_FOUND", { message: "original file not found" });
    }

    // media is rebuilt server-side from the stored original — never the client.
    const media: Media = {
      sha256: original.sha256,
      mimeType: original.mime as Media["mimeType"],
      fileSizeBytes: original.sizeBytes,
      width: original.width ?? 0,
      height: original.height ?? 0,
    };

    const existing = await context.db.select().from(evidenceRecords);
    const now = new Date();
    const evidenceId = formatEvidenceId(now.getFullYear(), existing.length + 1);
    const evidence = evidenceSchema.parse(
      buildEvidence({
        evidenceId,
        media,
        claims: input.claims,
        createdAt: now.toISOString(),
      })
    );

    const bytes = await storage.readBytes(original.id);
    let signed: Awaited<ReturnType<typeof signImage>>;
    try {
      signed = await signImage({
        bytes,
        mime: media.mimeType,
        title: evidenceId,
        evidence,
      });
    } catch (cause) {
      throw routerError("TOOL_ERROR", {
        message: "c2pa signing failed",
        cause,
      });
    }

    const signedHash = sha256(signed.signedBytes);
    const fingerprint = await perceptualHash(signed.signedBytes);
    const signedRow = await storage.storeFile(context.db, {
      bytes: signed.signedBytes,
      kind: "signed",
      mime: media.mimeType,
      sha256: signedHash,
      sizeBytes: signed.signedBytes.length,
      width: original.width,
      height: original.height,
    });

    await context.db.insert(evidenceRecords).values({
      evidenceId,
      mode: evidence.mode,
      originalFileId: original.id,
      originalFileHash: original.sha256,
      signedFileId: signedRow.id,
      signedFileHash: signedHash,
      manifestLabel: signed.manifestLabel,
      claimGenerator: signed.claimGenerator,
      signatureStatus: signed.signatureStatus,
      fingerprint,
      validationErrors: [],
      extractedEvidenceJson: evidence,
      repositoryReceipt: {
        ingestedAt: new Date().toISOString(),
        manifestLabel: signed.manifestLabel,
        repository: "local-libsql",
        signedFileHash: signedHash,
      },
    });

    return {
      evidenceId,
      signedFileId: signedRow.id,
      signedFileHash: signedHash,
      manifestLabel: signed.manifestLabel,
      signatureStatus: signed.signatureStatus,
    };
  });

export const signRouter = { create };
