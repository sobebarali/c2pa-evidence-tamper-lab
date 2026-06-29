# API surface (`@c2pa-evidence-tamper-lab/api`)

> oRPC contract format, error taxonomy, context, and shared building blocks. The procedure tree lives in [`src/routers/AGENTS.md`](src/routers/AGENTS.md); integrations in [`src/integrations/AGENTS.md`](src/integrations/AGENTS.md). Testing doctrine: [`../config/AGENTS.md`](../config/AGENTS.md).

## Contract format

Every procedure is documented in its module's `AGENTS.md` with five fields:

- **Access:** `public` (this lab has no required auth — `publicProcedure` only).
- **Input:** a **named** Zod schema exported from the module's `schema.ts` (never inlined in `index.ts`). Validated at the boundary via `.input(schema)`.
- **Output:** the serialized shape, enforced via `.output(schema)`.
- **Errors:** codes from the taxonomy below, declared via `.errors({ CODE: {} })`.
- **Side effects:** DB writes / file writes / "none".

Procedures are built fluently and exported as a plain object, merged into `appRouter` (nesting = namespacing):

```ts
const create = publicProcedure
  .errors({ BAD_REQUEST: {}, TOOL_ERROR: {} })
  .input(createInput)
  .output(createOutput)
  .handler(async ({ input, context }) => { /* ... */ });
export const signRouter = { create };
```

## Error taxonomy

These are for **malformed requests and tool crashes** — surfaced to the client as typed oRPC errors via `routerError(code)` ([`src/routers/_shared/errors.ts`](src/routers/_shared/errors.ts)). Routers never construct `new ORPCError(...)` directly.

| Code | HTTP | When |
|------|------|------|
| `BAD_REQUEST` | 400 | Input fails a domain check beyond Zod (e.g. unknown `fileId`, bad tamper method). |
| `NOT_FOUND` | 404 | `fileId` / `evidenceId` does not exist. |
| `CONFLICT` | 409 | `evidenceId` collision on insert. |
| `PAYLOAD_TOO_LARGE` | 413 | Upload exceeds `MAX_UPLOAD_BYTES`. |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Not `image/jpeg` or `image/png`. |
| `TOOL_ERROR` | 502 | c2pa-node / sharp threw unexpectedly (signer can't load, encode failure). |
| `UNKNOWN` | 500 | Unclassifiable failure. |

### Verification statuses are NOT errors

The **verify** flow always *returns* a result object. A tampered or unsigned image is a **successful** call, not an error:

| `uploadedFileStatus` | Meaning |
|------|---------|
| `verified` | Manifest present, C2PA validation clean (trust unverified in dev → `C2PA_TRUST_UNVERIFIED`). |
| `tampered` | Manifest present, validation failed (a `.mismatch` in `validation_status`); `evidenceId` may still be recoverable. |
| `manifest_missing` | No C2PA manifest (unsigned, or metadata stripped). |
| `manifest_invalid` | Manifest present but unparseable / signature broken. |
| `unknown` | Verifier could not confidently classify. |

Reason codes (response data, from `task.md` §6): `C2PA_MANIFEST_MISSING`, `C2PA_MANIFEST_PARSE_FAILED`, `C2PA_SIGNATURE_INVALID`, `C2PA_TRUST_UNVERIFIED`, `HASH_ASSERTION_MISMATCH`, `EVIDENCE_JSON_SCHEMA_INVALID`, `EVIDENCE_ID_NOT_FOUND_IN_DB`, `MATCHED_PRIOR_EVIDENCE_RECORD`.

## Shared building blocks (copy these, don't re-derive)

1. Every router folder = `index.ts` + `schema.ts`; named Zod inputs/outputs in `schema.ts`.
2. Validate at the boundary — `.input(schema)` on every procedure with args.
3. External/IO work goes through `src/integrations/*` (c2pa, imaging, storage) — never inline in a router.
4. Taxonomy errors via `routerError(...)` — never raw `new ORPCError(...)`.
5. The DB is **not** cryptographic truth — the C2PA verifier decides validity; the DB only links an upload back to a prior record by `evidenceId` (`task.md` §5).

## Context

`createContext({ context, db })` returns `{ db }` — the db is **injected** so handlers never import the singleton (testable + env-free at import). Tests build context via [`src/test-support/context.ts`](src/test-support/context.ts) `testContext(db)` over an in-memory libSQL db.

## Links

- Routers tree: [`src/routers/AGENTS.md`](src/routers/AGENTS.md) · Integrations: [`src/integrations/AGENTS.md`](src/integrations/AGENTS.md) · Evidence schema: [`src/evidence/AGENTS.md`](src/evidence/AGENTS.md)
- Root: [`../../AGENTS.md`](../../AGENTS.md) · Testing: [`../config/AGENTS.md`](../config/AGENTS.md)
