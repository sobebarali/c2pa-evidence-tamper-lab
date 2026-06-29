import type { Db } from "@c2pa-evidence-tamper-lab/db";

import type { Context } from "../context";

// Build a Context for integration tests from an in-memory libSQL db
// (createTestDb). Type-only imports here so the real db singleton / env are
// never loaded at test time.
export function testContext(db: Db): Context {
  return { db };
}
