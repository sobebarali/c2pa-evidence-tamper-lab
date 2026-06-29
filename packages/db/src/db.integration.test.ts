import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import { evidenceRecords, files } from "./schema";
import { createTestDb } from "./testing";

// Harness self-test: proves in-memory libSQL + pushSQLiteSchema applies the real
// schema and round-trips writes (incl. json + timestamp column modes).
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let close: () => void;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});

afterAll(() => {
  close();
});

it("round-trips a file row with a populated timestamp", async () => {
  await db.insert(files).values({
    id: "file_1",
    kind: "signed",
    sha256: "abc",
    mime: "image/jpeg",
    sizeBytes: 1234,
    width: 64,
    height: 64,
  });

  const [row] = await db.select().from(files).where(eq(files.id, "file_1"));
  expect(row?.kind).toBe("signed");
  expect(row?.createdAt).toBeInstanceOf(Date);
});

it("round-trips an evidence record with json columns", async () => {
  await db.insert(files).values({
    id: "orig_1",
    kind: "original",
    sha256: "o",
    mime: "image/jpeg",
    sizeBytes: 10,
  });
  await db.insert(files).values({
    id: "signed_1",
    kind: "signed",
    sha256: "s",
    mime: "image/jpeg",
    sizeBytes: 20,
  });

  await db.insert(evidenceRecords).values({
    evidenceId: "ev_2026_001",
    mode: "journalism",
    originalFileId: "orig_1",
    originalFileHash: "o",
    signedFileId: "signed_1",
    signedFileHash: "s",
    manifestLabel: "urn:c2pa:abc",
    claimGenerator: "Original Pictures Evidence Agent/1.0",
    signatureStatus: "valid",
    validationErrors: [],
    extractedEvidenceJson: { evidenceId: "ev_2026_001", mode: "journalism" },
  });

  const [row] = await db
    .select()
    .from(evidenceRecords)
    .where(eq(evidenceRecords.evidenceId, "ev_2026_001"));
  expect(row?.extractedEvidenceJson).toEqual({
    evidenceId: "ev_2026_001",
    mode: "journalism",
  });
  expect(row?.validationErrors).toEqual([]);
});
