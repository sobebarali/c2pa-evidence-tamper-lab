import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Stored image bytes live on disk under env.DATA_DIR keyed by `id`; this table
// is the addressable index (served via GET /files/:id). Content facts are
// captured at store time so the UI never re-decodes.
export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  kind: text("kind", {
    enum: ["original", "signed", "tampered", "uploaded"],
  }).notNull(),
  sha256: text("sha256").notNull(),
  mime: text("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  width: integer("width"),
  height: integer("height"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// One row per signed evidence record (task.md §5). The DB links an upload back
// to a prior record by evidenceId — it is NOT the source of cryptographic
// truth; the C2PA verifier decides validity.
export const evidenceRecords = sqliteTable("evidence_records", {
  evidenceId: text("evidence_id").primaryKey(),
  mode: text("mode", { enum: ["journalism", "inspection"] }).notNull(),
  originalFileId: text("original_file_id")
    .notNull()
    .references(() => files.id),
  originalFileHash: text("original_file_hash").notNull(),
  signedFileId: text("signed_file_id")
    .notNull()
    .references(() => files.id),
  signedFileHash: text("signed_file_hash").notNull(),
  manifestLabel: text("manifest_label"),
  claimGenerator: text("claim_generator"),
  // Perceptual fingerprint (dHash) of the signed image — a soft binding used to
  // recover this record when the C2PA manifest has been stripped. Nullable for
  // rows written before fingerprinting existed.
  fingerprint: text("fingerprint"),
  signatureStatus: text("signature_status", {
    enum: ["valid", "invalid", "unknown"],
  }).notNull(),
  validationErrors: text("validation_errors", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  extractedEvidenceJson: text("extracted_evidence_json", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  // Models the C2PA 2.4 c2pa.repository-receipt assertion: proof this manifest
  // was ingested into a repository (here, this DB). Modeled in-store — not yet
  // emitted back into the manifest (SDK limitation). Nullable for older rows.
  repositoryReceipt: text("repository_receipt", { mode: "json" }).$type<{
    ingestedAt: string;
    manifestLabel: string | null;
    repository: string;
    signedFileHash: string;
  }>(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type FileRow = typeof files.$inferSelect;
export type NewFileRow = typeof files.$inferInsert;
export type EvidenceRecordRow = typeof evidenceRecords.$inferSelect;
export type NewEvidenceRecordRow = typeof evidenceRecords.$inferInsert;
