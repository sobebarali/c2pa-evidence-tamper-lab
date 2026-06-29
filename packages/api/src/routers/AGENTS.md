# routers tree

> The procedure tree merged into `appRouter`. Each router maps a step of the task.md workflow. Contract format + error taxonomy: [`../../AGENTS.md`](../../AGENTS.md). All procedures are `public`.

## `upload.create` — step 1
- **Input:** `{ file: File }` (jpeg/png).
- **Output:** `{ fileId, media, capture }` — server-derived facts (sha256/mime/dims via sharp+crypto; capturedAt/gps via exifr, honest nulls).
- **Errors:** `BAD_REQUEST` (not a readable image) · `UNSUPPORTED_MEDIA_TYPE` (not jpeg/png) · `PAYLOAD_TOO_LARGE` · `TOOL_ERROR` (store failed).
- **Side effects:** writes original bytes to disk + a `files` row. Detected mime is authoritative (never the client's content-type).

## `sign.create` — steps 2–4
- **Input:** `{ originalFileId, claims }` (`claims` = `evidenceClaimsSchema`).
- **Output:** `{ evidenceId, signedFileId, signedFileHash, manifestLabel, signatureStatus }`.
- **Errors:** `NOT_FOUND` (original missing) · `TOOL_ERROR` (signing failed).
- **Side effects:** mints `evidenceId`; builds the canonical evidence JSON (media rebuilt server-side); signs via c2pa (evidence + modeled CAWG identity assertions); stores the signed `files` row + the `evidence_records` row (incl. perceptual `fingerprint` + `repositoryReceipt`).

## `tamper.create` — step 5
- **Input:** `{ signedFileId, method: "strip" | "pixel" }`.
- **Output:** `{ tamperedFileId, sha256, method }`.
- **Errors:** `NOT_FOUND` (signed missing) · `TOOL_ERROR`.
- **Side effects:** writes a tampered `files` row.

## `verify.check` — step 6
- **Input:** `{ file: File }`.
- **Output:** the task.md §7 result — `{ uploadedFileId, uploadedFileStatus, matchedEvidenceId, matchedOriginalRecord, reasonCodes[], uploadedFileHash, originalSignedFileHash, message }` plus `report` (v2 `{ validationState, validationResults }`, nullable) and `identity` (`{ present, signerName }`).
- **Errors:** none — a tampered/unsigned image is a **successful** result (status in the body); an unexpected verifier failure returns status `unknown` (+`C2PA_VERIFIER_ERROR`), never a thrown error.
- **Side effects:** stores the uploaded `files` row; reads `evidence_records` by recovered `evidenceId` — first from the manifest, then (when missing) by perceptual-fingerprint soft binding (`MATCHED_BY_SOFT_BINDING`).
- **Extra reason codes (beyond task.md §6):** `MATCHED_BY_SOFT_BINDING`, `CAWG_IDENTITY_PRESENT`, `CAWG_IDENTITY_INVALID`.

## `records.list` / `records.get`
- **Input:** list — none; get — `{ evidenceId }`.
- **Output:** the §5 record view(s) (hashes, manifest label, signature status, validation errors, extracted evidence json, createdAt ISO) plus `repositoryReceipt` (modeled `c2pa.repository-receipt`, nullable).
- **Errors:** list — `TOOL_ERROR` (read failed); get — `NOT_FOUND` · `TOOL_ERROR` (read failed).
- **Side effects:** none.

## Conventions (Rule → Why)

| Rule | Why |
|------|-----|
| named Zod in `schema.ts`, `.input()/.output()` on every proc | validate at the boundary; output shape is enforced |
| file facts + media rebuilt server-side | the client cannot forge hashes/dimensions |
| verify returns status, never throws on bad images | statuses/reason codes are data, not errors |
| taxonomy errors via `routerError(...)` | one mapping to HTTP status |

## Hardest invariants

`sign→verify` round-trips to `verified` + a matched record; `pixel` tamper → `tampered` (still matched); `strip` tamper → `manifest_missing` (unmatched). The private key never appears in any output or row. (All proven in the colocated `*.integration.test.ts`, covering task.md §11.)

## Links

- Contract/taxonomy: [`../../AGENTS.md`](../../AGENTS.md) · Integrations: [`../integrations/AGENTS.md`](../integrations/AGENTS.md) · Evidence: [`../evidence/AGENTS.md`](../evidence/AGENTS.md)
