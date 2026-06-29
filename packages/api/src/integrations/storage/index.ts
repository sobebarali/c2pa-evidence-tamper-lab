import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Db } from "@c2pa-evidence-tamper-lab/db";
import { type FileRow, files } from "@c2pa-evidence-tamper-lab/db";
import { env } from "@c2pa-evidence-tamper-lab/env/server";
import { eq } from "drizzle-orm";

export interface StoreFileInput {
  bytes: Buffer;
  height: number | null;
  kind: FileRow["kind"];
  mime: string;
  sha256: string;
  sizeBytes: number;
  width: number | null;
}

// Disk-backed, content-addressable image store. Bytes live under `baseDir`
// keyed by a uuid; the `files` table is the addressable index. db is passed in
// (from context) so this never touches the singleton.
export function createStorage(baseDir: string) {
  const pathFor = (id: string) => join(baseDir, id);

  return {
    async storeFile(db: Db, input: StoreFileInput): Promise<FileRow> {
      await mkdir(baseDir, { recursive: true });
      const id = randomUUID();
      await writeFile(pathFor(id), input.bytes);
      const [row] = await db
        .insert(files)
        .values({
          id,
          kind: input.kind,
          mime: input.mime,
          sha256: input.sha256,
          sizeBytes: input.sizeBytes,
          width: input.width,
          height: input.height,
        })
        .returning();
      if (!row) {
        throw new Error("failed to insert file row");
      }
      return row;
    },

    async getFileRow(db: Db, id: string): Promise<FileRow | undefined> {
      const rows = await db.select().from(files).where(eq(files.id, id));
      return rows[0];
    },

    readBytes(id: string): Promise<Buffer> {
      return readFile(pathFor(id));
    },
  };
}

export type Storage = ReturnType<typeof createStorage>;

// Singleton used by routers (env-configured dir). Tests build their own with a
// temp dir via createStorage().
export const storage = createStorage(env.DATA_DIR);
