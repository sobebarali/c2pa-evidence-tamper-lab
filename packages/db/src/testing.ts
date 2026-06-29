import { createClient } from "@libsql/client";
import { pushSQLiteSchema } from "drizzle-kit/api";
import { drizzle } from "drizzle-orm/libsql";

// biome-ignore lint/performance/noNamespaceImport: drizzle needs the full schema object
import * as schema from "./schema";

// In-memory libSQL test DB — the SQLite analog of fomo's PGlite harness.
// Pushes the REAL Drizzle schema so unique constraints / defaults behave
// exactly as production. A test that passes here would pass on Turso.
export async function createTestDb() {
  const client = createClient({ url: ":memory:" });
  const db = drizzle({ client, schema });
  const { apply } = await pushSQLiteSchema(schema, db);
  await apply();
  return { db, close: () => client.close() };
}
