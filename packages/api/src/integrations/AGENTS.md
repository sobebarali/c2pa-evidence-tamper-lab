# integrations

> Local IO-boundary modules the routers call. Unlike fomo's network edges, these are **deterministic and run for real in tests** (demo certs + temp `DATA_DIR` + fixture images). Contract/taxonomy: [`../../AGENTS.md`](../../AGENTS.md).

## Modules

### `storage` — disk file store
`createStorage(baseDir)` → `{ storeFile, getFileRow, readBytes }`. Bytes live under `DATA_DIR` keyed by uuid; the `files` table is the index (served via `GET /files/:id`). `db` is passed per-call. Singleton `storage` uses `env.DATA_DIR`; tests pass a temp dir.

### `imaging` — sharp + exifr + sharp-phash + crypto
- `sha256(bytes)` — node:crypto, no dep.
- `perceptualHash(bytes)` → 64-bit DCT pHash (`sharp-phash`); `hammingDistance(a,b)` — soft-binding fingerprint for recovering a stripped/re-encoded image.
- `extractMetadata(bytes)` → `{ mime, width, height, sizeBytes, capturedAt, gps }`; missing EXIF/GPS → `null` (honest, not invalid).
- `tamper(bytes, "strip"|"pixel")` — `strip` re-encodes via sharp (drops the manifest → `manifest_missing`); `pixel` byte-patches the JPEG scan, preserving the C2PA segment (→ `tampered`, evidenceId recoverable). The pixel offset is a heuristic (ponytail-marked).

### `c2pa` — @contentauth/c2pa-node wrapper
- `signImage({ bytes, mime, title, evidence })` → `{ signedBytes, manifestLabel, claimGenerator, signatureStatus }`. Embeds the evidence JSON (`com.originalpictures.evidence`) + a modeled CAWG identity assertion (`com.originalpictures.identity`); signs with the dev demo certs (`LocalSigner`, es256).
- `readManifest(bytes, mime)` → `{ hasManifest, manifestLabel, claimGenerator, evidence, hasIdentity, identitySignerName, validationStatus, validationResults, validationState, parseFailed, hasC2paBytes }`. Reader settings are env-driven (`C2PA_VERIFY_TRUST`, default false → dev certs untrusted).
- `classify(read)` → `{ status, reasonCodes }`: prefers the **v2** surface (`validationState` + `validationResults.activeManifest.failure[]`), falling back to legacy `validationStatus`. `Valid`/`Trusted` → `verified` (+`C2PA_TRUST_UNVERIFIED` unless Trusted); `Invalid` → `tampered` (+`HASH_ASSERTION_MISMATCH`/`C2PA_SIGNATURE_INVALID`); no manifest + no c2pa bytes → `manifest_missing`; parse fail + c2pa bytes → `manifest_invalid`.

## Conventions (Rule → Why)

| Rule | Why |
|------|-----|
| run for real in tests | the pipeline is local + deterministic; mocking would prove nothing |
| `classify` never throws on bad input | verify always returns a status — a tampered/unsigned image is success, not an error |
| demo key read only by the signer | task.md hard rule — never in db/response/exports |
| `verify_trust:false` in dev | untrusted dev cert ≠ tamper |

## Hardest invariant — tamper detection

A `pixel`-tampered signed image classifies as `tampered` with the `evidenceId` still recoverable from the assertion; a `strip`-tampered image classifies as `manifest_missing`. (Proven in `c2pa/c2pa.integration.test.ts`.)

## Links

- Contract: [`../../AGENTS.md`](../../AGENTS.md) · Evidence schema: [`../evidence/AGENTS.md`](../evidence/AGENTS.md) · Routers: [`../routers/AGENTS.md`](../routers/AGENTS.md)
