import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createTestDb } from "@c2pa-evidence-tamper-lab/db/testing";
import { afterAll, beforeAll, expect, it } from "vitest";

import { createStorage } from "./index";

let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let close: () => void;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});

afterAll(() => {
  close();
});

it("stores bytes on disk, indexes the row, and reads them back", async () => {
  const dir = await mkdtemp(join(tmpdir(), "c2pa-store-"));
  const storage = createStorage(dir);
  const bytes = Buffer.from("hello-image-bytes");

  const row = await storage.storeFile(db, {
    bytes,
    kind: "original",
    mime: "image/jpeg",
    sha256: "x".repeat(64),
    sizeBytes: bytes.length,
    width: 10,
    height: 10,
  });
  expect(row.id).toBeTruthy();

  const fetched = await storage.getFileRow(db, row.id);
  expect(fetched?.kind).toBe("original");

  const readBack = await storage.readBytes(row.id);
  expect(readBack.equals(bytes)).toBe(true);
});

it("returns undefined for an unknown file id", async () => {
  const storage = createStorage(await mkdtemp(join(tmpdir(), "c2pa-store-")));
  expect(await storage.getFileRow(db, "missing")).toBeUndefined();
});
