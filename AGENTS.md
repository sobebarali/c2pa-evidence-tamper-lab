# C2PA Evidence Tamper Lab

These rules apply to every agent working in this project — Claude Code, opencode, Codex, or any
other — unless explicitly overridden. Bias: caution over speed on non-trivial work.

**What this is:** a **local-first content-provenance workflow**. The user uploads an original image,
fills an evidence JSON record, signs it into a **C2PA** manifest, extracts and stores that manifest in
a local DB, generates a tampered copy, re-uploads it, and the app detects tamper/missing/invalid and
links back to the original `evidenceId` when possible. **`task.md` is the full spec** — read it before
building any feature. It defines the 6-step workflow, evidence/DB schemas, verification statuses, and
reason codes. Use **real C2PA tooling** (c2patool / SDK) — provenance must not be only mocked; state
clearly anything that is.

**Stack:** Bun + Turborepo monorepo (`@c2pa-evidence-tamper-lab/*`), generated with Better-T-Stack.
- `apps/web` — **React 19 + TanStack Router** (file-based routes in `src/routes`), Vite, Tailwind v4. Dev on http://localhost:3001.
- `apps/server` — **Hono** entry; mounts oRPC **RPC at `/rpc`** and **OpenAPI at `/api-reference`**; serves stored images at **`GET /files/:id`**; `evlog` logging; CORS; upload `bodyLimit`. Runs on http://localhost:3000.
- `packages/api` — **oRPC** routers (`src/routers`) + integrations (`src/integrations`) + shared evidence schema (`src/evidence`) + context (`src/context.ts`, db injected); `publicProcedure` from `src/index.ts`; end-to-end typed, OpenAPI.
- `packages/db` — **Drizzle ORM** over **libSQL/SQLite (Turso)**; `createDb()`/`db`/`Db` + re-exported tables in `src/index.ts`; `files` + `evidence_records` in `src/schema`; in-memory test harness in `src/testing.ts`.
- `packages/ui` — shared **shadcn/ui** primitives; import via `@c2pa-evidence-tamper-lab/ui/components/*`.
- `packages/env` — validated env (t3-env + **Zod 4**): server `DATABASE_URL`/`CORS_ORIGIN`/`NODE_ENV`/`DATA_DIR`/`MAX_UPLOAD_BYTES`/`C2PA_*_PATH`, web `VITE_SERVER_URL`.
- `packages/config` — shared tsconfig base + the Vitest harness factory (`vitest.base.ts`) + testing doctrine.

Auth is intentionally **out of scope** (this lab needs none) — `publicProcedure` only; `context` carries just `db`.
C2PA path: in-process **`@contentauth/c2pa-node`** with dev demo certs (`fixtures/dev-certs/`, untrusted, `verify_trust:false`). See `DECISIONS.md` for what is real vs mocked.

Validation: **Zod 4**. Lint/format: **Ultracite** (Biome) — `bun x ultracite fix`. Types: `bun run check-types`. Tests: `bun run test` (Vitest; real in-memory libSQL + real C2PA signing).
Dev: `bun run dev`. **Setup once: `bun run db:push`** (creates `files`/`evidence_records` in `local.db`). DB: `db:local` · `db:generate` · `db:studio` · `db:migrate`.
Ultracite (Biome) code standards: `.claude/CLAUDE.md` — read before writing code.

## Spec-Driven Development (SDD)

The spec **is** a per-module `AGENTS.md` colocated with the code; `CLAUDE.md` is a symlink to it (one file
for Claude Code / opencode / Codex). Colocated `*.integration.test.ts` assert the contract.

- **Read the nearest `AGENTS.md` first** — it's the contract for that code. Start there.
- **Spec in lockstep** — update the module's `AGENTS.md` (procedures · Zod I/O · error codes · side effects) **with** the code. Edit `AGENTS.md` only; `CLAUDE.md` is the symlink.
- **New module** = folder + `AGENTS.md` + `CLAUDE.md` symlink (copy a sibling module's shape), then `schema.ts` + `index.ts` + `<name>.integration.test.ts`.
- **Tests assert intent** — oRPC **error codes** + Zod I/O + side effects (real in-memory libSQL via `createTestDb`); the C2PA pipeline runs **for real** (demo certs). Never assert message strings. Full doctrine: [`packages/config/AGENTS.md`](packages/config/AGENTS.md).
- **Record decisions** in the module's `AGENTS.md` / `DECISIONS.md`.

## Module map

API contract format + error taxonomy: [`packages/api/AGENTS.md`](packages/api/AGENTS.md). Testing doctrine: [`packages/config/AGENTS.md`](packages/config/AGENTS.md).

| Module | Path | Role |
|--------|------|------|
| API surface | `packages/api` | oRPC contract, error taxonomy, context, building blocks |
| Routers tree | `packages/api/src/routers` | the procedure tree merged into `appRouter` |
| `evidence` | `packages/api/src/evidence` | canonical evidence-JSON Zod schema + builders (shared with web) |
| `upload` | `packages/api/src/routers/upload` | step 1 — file facts + store original |
| `sign` | `packages/api/src/routers/sign` | steps 2–4 — manifest, sign, extract, store record |
| `tamper` | `packages/api/src/routers/tamper` | step 5 — strip/pixel tampered copy |
| `verify` | `packages/api/src/routers/verify` | step 6 — classify + recover evidenceId + link |
| `records` | `packages/api/src/routers/records` | list/get stored evidence records |
| `c2pa` | `packages/api/src/integrations/c2pa` | @contentauth/c2pa-node sign/read/classify |
| `imaging` | `packages/api/src/integrations/imaging` | sharp/exifr metadata + sha256 + tamper |
| `storage` | `packages/api/src/integrations/storage` | disk file store + `files` index |
| `db` | `packages/db` | Drizzle schema + queries + PGlite-style libSQL test harness |
| `env` | `packages/env` | validated env |
| `config` | `packages/config` | tsconfig base + testing doctrine + Vitest harness |
| `web` | `apps/web` | TanStack Router UI (the §8 pages) |

## Working rules

1. **Think before coding.** State assumptions. Ask rather than guess. Push back when a simpler approach exists. Stop when confused.
2. **Simplicity first.** Minimum code that solves the problem. No speculative abstractions.
3. **Surgical changes.** Touch only what you must. Don't refactor what isn't broken. Match existing style.
4. **Read before you write.** Read `task.md`, exports, callers, and `packages/api/src/context.ts` before adding code.
5. **Verify dependencies.** Check what's current/maintained before adding a library; prefer the actively-maintained option that fits the stack; pin the version. Use `context7` for docs.
6. **Research non-trivial choices, then ask.** Surface 2–4 vetted options with trade-offs via `AskUserQuestion` and let the user pick. Skip only for trivial changes.
7. **Track multi-step work.** Any task with ≥3 steps uses the task tracker; `in_progress` before starting, `completed` the moment it ships.
8. **Fail loud.** "Completed"/"tests pass" is wrong if anything was skipped silently. Surface uncertainty.
9. **No comments unless they earn it.** Names say WHAT; comment only the non-obvious WHY.
10. **Match the codebase's conventions** even if you disagree. Conformance > taste.
11. **Plan non-trivial work first** — anything touching >2 files, the data model, or a public API surface.

## Domain hard rules (never violated)

- **No shell injection.** If invoking a CLI (c2patool) from the backend, never build commands by string
  concatenation. Use `execFile`/`spawn` with **argument arrays**, validate file paths, set timeouts, and
  isolate temp files. (`task.md` §2)
- **Private keys never leak.** Signing keys must not be stored in the DB, returned from the API, embedded
  in exports, or committed — except clearly-labeled **demo fixtures**, stated as development-only. (`task.md` §9, test #10)
- **Real C2PA only.** Add → read back → verify a real manifest. If a feature is mocked due to library
  limits, document exactly what is mocked vs real in `DECISIONS.md`. (`task.md` §9, §12)
- **Be honest about missing data.** Missing EXIF/GPS ≠ invalid file — represent absence honestly; never fabricate. (`task.md` §1, §3)
- **Treat user-entered evidence fields as untrusted.** Validate every input with **Zod** before any DB write
  or external call; sanitize before rendering (no script execution in UI/PDF). (`task.md` §4, test #9)
- **The DB is not cryptographic truth.** The C2PA verifier decides validity; the DB only links an upload
  back to a prior evidence record. (`task.md` §5)
- **Verification taxonomy is fixed** — statuses (`verified`/`tampered`/`manifest_missing`/`manifest_invalid`/`unknown`)
  and reason codes are defined in `task.md` §6–7. Map to them; don't invent parallel ones.
- **Env via `@c2pa-evidence-tamper-lab/env`** (validated at boot — missing/invalid var fails fast).

## Structure

```
c2pa-evidence-tamper-lab/
├── apps/
│   ├── web/      # React 19 + TanStack Router (src/routes), Vite, Tailwind v4
│   └── server/   # Hono + oRPC handlers (RPC /rpc, OpenAPI /api-reference)
├── packages/
│   ├── api/      # oRPC routers (src/routers) + context — typed API surface
│   ├── db/       # Drizzle schema (src/schema) + libSQL/SQLite
│   ├── ui/       # shared shadcn/ui primitives
│   ├── env/      # validated env (t3-env + Zod 4)
│   └── config/   # shared tsconfig/tooling base
```

C2PA domain modules (signer, reader, verifier, tamper, records, image metadata/hash, evidence schema)
and the UI pages in `task.md` §8 are **to be built**. See `task.md` §10 for the target layout and §11
for the required tests. Record real-vs-mocked decisions and dependency choices in `DECISIONS.md`.
