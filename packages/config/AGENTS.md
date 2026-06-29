# config (`@c2pa-evidence-tamper-lab/config`)

> Shared tsconfig base + the testing doctrine and Vitest harness factory. Contract/taxonomy: [`../api/AGENTS.md`](../api/AGENTS.md).

## What's here

- `tsconfig.base.json` — strict TS base extended by every package.
- `vitest.base.ts` — `defineVitestConfig({ env })` factory + `testEnv` (dummy env so `@c2pa-evidence-tamper-lab/env` validates at import). Each package's `vitest.config.ts` is one line: `export default defineVitestConfig({ env: testEnv })`.

## Testing doctrine (the trophy)

Effort weighted top → bottom:

1. **Static analysis (maximize)** — strict TS + Ultracite/Biome; `check-types` gates work.
2. **Integration (the bulk)** — exercise a router through its public surface via `call(appRouter.x.y, input, { context: testContext(db) })` from `@orpc/server`, against a **real in-memory libSQL db** ([`../db/src/testing.ts`](../db/src/testing.ts) `createTestDb()` — the SQLite analog of fomo's PGlite). Colocated `*.integration.test.ts`.
3. **E2E (thin)** — a few critical HTTP paths, later.
4. **Unit (selective)** — pure helpers (classify, evidenceId, pixel-patch offset math).

### Deviation from fomo: the C2PA pipeline runs FOR REAL

fomo mocks network edges (BirdEye/Jupiter). Here the whole pipeline — `c2pa` (sign/read/verify), `imaging` (sharp/exifr/hash/tamper), `storage` (disk) — is **local and deterministic**, so integration tests run it **for real**. The test seams are: the **demo certs** in `fixtures/dev-certs/`, a temp `DATA_DIR`, and fixture images under a module's `__fixtures__/`. **No network ⇒ nothing to mock.** (If a future external edge appears, mock only that edge.)

### Assert intent, not strings

- oRPC failures → assert the **code**: `.rejects.toMatchObject({ code: "BAD_REQUEST" })`.
- Verify outcomes → assert the **status/reasonCode enums** (`uploadedFileStatus`, `reasonCodes`), never `message` text.
- Side effects → query the real db (`db.select().from(evidenceRecords)`).

### Conventions

| Rule | Why |
|------|-----|
| `*.integration.test.ts` through the surface; `*.test.ts` unit | one obvious place per kind |
| `beforeAll → createTestDb()`, `afterEach → delete rows`, `afterAll → close()` | isolated, fast, real constraints |
| Never assert on error/message strings | messages drift; codes/enums are the contract |
| Demo key never leaves the signer | `task.md` hard rule — not in db/response/exports |

## Links

- Contract/taxonomy: [`../api/AGENTS.md`](../api/AGENTS.md) · DB harness: [`../db/AGENTS.md`](../db/AGENTS.md) · Root: [`../../AGENTS.md`](../../AGENTS.md)
