import type { Db } from "@c2pa-evidence-tamper-lab/db";

import type { Context } from "../context";

// Build a Context for integration tests from an in-memory libSQL db
// (createTestDb). Type-only imports here so the real db singleton / env are
// never loaded at test time.
export function testContext(db: Db): Context {
  return { db };
}

// A Context whose db throws on any access — simulates an infra/DB failure
// (e.g. schema drift, connection loss) so handlers can be asserted to map it
// to TOOL_ERROR instead of leaking an opaque 500.
export function brokenContext(): Context {
  const db = new Proxy(
    {},
    {
      get() {
        throw new Error("db unavailable");
      },
    }
  );
  return { db: db as unknown as Db };
}
