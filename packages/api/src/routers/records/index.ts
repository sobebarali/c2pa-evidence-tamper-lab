import {
  type EvidenceRecordRow,
  evidenceRecords,
} from "@c2pa-evidence-tamper-lab/db";
import { desc, eq } from "drizzle-orm";

import { publicProcedure } from "../../index";
import { routerError } from "../_shared/errors";
import { getInput, listOutput, type RecordView, recordView } from "./schema";

function toView(row: EvidenceRecordRow): RecordView {
  return {
    evidenceId: row.evidenceId,
    mode: row.mode,
    originalFileId: row.originalFileId,
    signedFileId: row.signedFileId,
    originalFileHash: row.originalFileHash,
    signedFileHash: row.signedFileHash,
    manifestLabel: row.manifestLabel,
    claimGenerator: row.claimGenerator,
    signatureStatus: row.signatureStatus,
    validationErrors: row.validationErrors,
    extractedEvidenceJson: row.extractedEvidenceJson,
    createdAt: row.createdAt.toISOString(),
  };
}

// Step 6 (records view) — list stored evidence records / fetch one by id.
const list = publicProcedure.output(listOutput).handler(async ({ context }) => {
  const rows = await context.db
    .select()
    .from(evidenceRecords)
    .orderBy(desc(evidenceRecords.createdAt));
  return { items: rows.map(toView) };
});

const get = publicProcedure
  .errors({ NOT_FOUND: {} })
  .input(getInput)
  .output(recordView)
  .handler(async ({ input, context }) => {
    const [row] = await context.db
      .select()
      .from(evidenceRecords)
      .where(eq(evidenceRecords.evidenceId, input.evidenceId));
    if (!row) {
      throw routerError("NOT_FOUND", { message: "evidence record not found" });
    }
    return toView(row);
  });

export const recordsRouter = { list, get };
