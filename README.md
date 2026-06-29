# C2PA Evidence Tamper Lab

A local-first **content-provenance** workflow: upload an image → fill an evidence
JSON record → sign it into a **C2PA** manifest → extract and store the record →
generate a tampered copy → re-upload and **verify** (detect `verified` /
`tampered` / `manifest_missing` / `manifest_invalid`), linking back to the
original `evidenceId`. See `task.md` for the full spec and `DECISIONS.md` for what
is real vs mocked.

## Stack

Bun + Turborepo monorepo (`@c2pa-evidence-tamper-lab/*`):

- **`apps/web`** — React 19 + TanStack Router (Vite, Tailwind v4) — http://localhost:3001
- **`apps/server`** — Hono + oRPC (`/rpc`, OpenAPI at `/api-reference`, images at `/files/:id`) — http://localhost:3000
- **`packages/api`** — oRPC routers + integrations (`c2pa`, `imaging`, `storage`) + shared evidence schema
- **`packages/db`** — Drizzle over libSQL/SQLite (`files`, `evidence_records`)
- **`packages/ui` / `packages/env` / `packages/config`**

**C2PA:** in-process [`@contentauth/c2pa-node`](https://github.com/contentauth/c2pa-js)
with dev demo certificates (`fixtures/dev-certs/`). Image facts via `sharp` +
`exifr`; SHA-256 via Node `crypto`.

## Setup

```bash
bun install          # installs deps (incl. the C2PA native binary — no Rust needed)
bun run db:push      # create files + evidence_records in local.db  ← required once
bun run dev          # web on :3001, server on :3000
```

`apps/server/.env` (already present) sets `DATABASE_URL`, `CORS_ORIGIN`, and
optionally `DATA_DIR` (where signed/tampered images are stored). Signing uses the
committed **dev-only** demo certs unless `C2PA_SIGN_CERT_PATH` / `C2PA_PRIVATE_KEY_PATH`
override them. The demo key is never stored in the DB, returned by the API, or exported.

## Use

Open http://localhost:3001:

1. **Create** — upload a JPEG/PNG (see file facts), fill journalism or inspection
   evidence, and sign it.
2. **Records** — browse stored evidence records.
3. **Tamper** — pick a signed image, choose `pixel` (keeps the manifest → detected
   as `tampered`) or `strip` (drops it → `manifest_missing`), and download the result.
4. **Verify** — re-upload the tampered/signed image to see the status, reason
   codes, and the linked original record.

## Scripts

- `bun run dev` — all apps in dev
- `bun run check-types` — typecheck every package
- `bun run test` — Vitest (real in-memory libSQL + real C2PA signing; covers `task.md` §11)
- `bun x ultracite fix` — lint/format (Biome)
- `bun run examples` — regenerate `examples/` (original, evidence.json, manifest.json, signed.jpg, tampered.jpg, db-export.json)
- `bun run db:studio` / `db:generate` / `db:migrate` / `db:local`

## Tests

`bun run test` runs the colocated `*.integration.test.ts` through the oRPC surface
against a real in-memory libSQL database and real C2PA signing — covering schema
validation, manifest creation, record persistence, evidenceId recovery, the
verified/tampered/missing matrix, malicious-text inertness, and key non-leakage.

## Deployment

Docker Compose (`docker-compose.yml`): `bun run docker:up` (web + server). Set the
C2PA cert/key env overrides for any non-dev deployment.
