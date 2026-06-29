import { type Db, db as defaultDb } from "@c2pa-evidence-tamper-lab/db";
import type { Context as HonoContext } from "hono";

export interface CreateContextOptions {
  context: HonoContext;
  // Injected so handlers never import the db singleton — keeps them testable
  // (tests pass an in-memory libSQL db via test-support/context.ts).
  db?: Db;
}

export function createContext({ db = defaultDb }: CreateContextOptions) {
  return { db };
}

export type Context = ReturnType<typeof createContext>;
