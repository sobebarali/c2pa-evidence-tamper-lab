import { env } from "@c2pa-evidence-tamper-lab/env/server";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

// biome-ignore lint/performance/noNamespaceImport: drizzle needs the full schema object
import * as schema from "./schema";

export function createDb() {
  const client = createClient({
    url: env.DATABASE_URL,
  });

  return drizzle({ client, schema });
}

export const db = createDb();

export type Db = ReturnType<typeof createDb>;

// Re-export tables + row types from the package entry so consumers reference the
// same schema module identity as `Db` (avoids a dual-path type mismatch when the
// router tree is fed to the oRPC handlers).
// biome-ignore lint/performance/noBarrelFile: deliberate single-identity re-export, not a barrel
export {
  type EvidenceRecordRow,
  evidenceRecords,
  type FileRow,
  files,
  type NewEvidenceRecordRow,
  type NewFileRow,
} from "./schema";
