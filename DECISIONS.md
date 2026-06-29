# DECISIONS.md

What is real, what is mocked, which C2PA tooling was used, how tampering is
detected, the limitations, and the production next steps.

## C2PA tooling

**`@contentauth/c2pa-node@0.6.0`** (MIT) — the current official Content
Authenticity Initiative Node binding (the standalone `c2pa-node-v2` repo was
archived and folded into `contentauth/c2pa-js`). Chosen over the `c2patool` CLI
because it runs **in-process** with prebuilt native binaries (no Rust toolchain),
supports embedding our evidence JSON as a custom assertion, and keeps the whole
pipeline deterministic and testable. `c2patool` remains a documented fallback if
the addon ever fails to install on a target platform.

Supporting libraries (all permissive OSS): `sharp@0.35.2` (Apache-2.0, image
dimensions/mime + tamper), `exifr@7.1.3` (MIT, EXIF timestamp + GPS),
`sharp-phash@2.2.0` (MIT, DCT perceptual fingerprint for soft-binding recovery),
Node built-in `node:crypto` for SHA-256 (no dependency).

## What is REAL

- **Signing** — a real C2PA manifest is built (`Builder.withJson`), signed
  (`LocalSigner`, ES256), and embedded into the image. The evidence JSON is a
  real custom assertion (`com.originalpictures.evidence`).
- **Extraction** — after signing the image is read back (`Reader.fromAsset`);
  the manifest label, claim generator, and evidence assertion are recovered.
- **Verification** — `verify_after_reading` runs the real C2PA validation;
  `classify()` reads the **C2PA v2 surface** (`validation_state` +
  `validation_results.activeManifest.failure[]`), falling back to legacy
  `validation_status` for v1 assets.
- **Tamper detection** — a pixel change produces a genuine hash mismatch
  (v2 `validation_state: "Invalid"`); a stripped image genuinely loses its
  manifest but is re-linked by perceptual fingerprint (see below).
- **File facts** — SHA-256, dimensions, mime, and EXIF/GPS are really computed;
  missing EXIF/GPS is represented as `null`, never faked.
- **Formats** — `image/jpeg` and `image/png` are accepted (schema `mediaSchema`).
  Sign, extract, verify, and `strip` tamper work for both; **`pixel` tamper is
  JPEG-only** (it patches the JPEG entropy-coded scan).
- **Database** — the evidence record is really persisted (SQLite/libSQL) and the
  `evidenceId` lookup is a real query.
- **Tests** — the integration tests sign/verify/tamper for real against an
  in-memory libSQL database; nothing in the pipeline is stubbed.

## What is MOCKED / dev-only

- **Nothing in the pipeline is mocked.** The only intentional fakes are:
  - **Demo signing certificates** (`fixtures/dev-certs/`) — the public ES256
    test fixtures from `c2pa-rs`. They are structurally valid but **untrusted**
    (chain to no real trust anchor). Verification runs with `verify_trust:false`
    so "untrusted dev cert" is never mistaken for tampering. A `verified` result
    therefore also carries the honest reason code `C2PA_TRUST_UNVERIFIED`.

## 2026 alignment  — real vs modeled

Improvements aligning the lab with the 2025–26 C2PA ecosystem (2.4, Conformance
Trust List, CAWG identity). Real where the SDK supports it; modeled + documented
where it does not.

- **v2 validation surface (CET-253)** — **REAL.** `classify()` reads
  `validation_state` / `validation_results` (v2), falling back to legacy
  `validation_status`. crJSON: **not emitted** by c2pa-node 0.6.0 — the verify
  `report` field ships the structured `validation_results` instead (crJSON
  reserved).
- **Soft-binding recovery (CET-254)** — **REAL.** A DCT perceptual fingerprint
  (`sharp-phash`) of the signed image is stored and used to re-link a
  manifest-stripped/re-encoded upload (`MATCHED_BY_SOFT_BINDING`). The link is
  advisory, never cryptographic. **Trustmark** (the C2PA-standard watermark, also
  shipped in 0.6.0) is the documented upgrade path — it needs an ML model file we
  do not bundle, so it is **not wired** (no dead config).
- **CAWG identity (CET-255)** — **MODELED.** Identity (reporter/org or inspector)
  is bound as a claim-signed assertion `com.originalpictures.identity` referencing
  the evidence assertion — tamper-evident under the manifest signature. The
  spec-conformant path (`IdentityAssertionSigner` + a COSE credential holder) is
  **NOT used**: in c2pa-node 0.6.0 it corrupts the claim signature with a local
  ES256 callback (`claimSignature.mismatch` / "could not parse signature"; the
  SDK's own identity test never asserts the signature validates). A real CAWG
  x509-COSE credential is the production upgrade.
- **Repository-receipt (CET-256)** — **MODELED.** A `c2pa.repository-receipt`-shaped
  record (`{ manifestLabel, signedFileHash, ingestedAt, repository }`) is stored on
  the `evidence_records` row at sign time. Emitting it back *into the manifest*
  awaits SDK support.
- **Trust-list verification (CET-257)** — **REAL & configurable.** `readManifest`
  builds reader settings via `createVerifySettings` + `createTrustSettings`, driven
  by `C2PA_VERIFY_TRUST` (default **false** — demo certs stay untrusted) and
  optional `C2PA_TRUST_ANCHORS_PATH`. A trusted chain surfaces
  `validation_state: "Trusted"` and drops `C2PA_TRUST_UNVERIFIED`.

## How tampering is detected

The signed image's hard binding (`c2pa.hash.data`, plus hashed-URI bindings over
embedded assertions/thumbnail) covers the image bytes. The **pixel** tamper mode
flips bytes inside the JPEG scan while leaving the C2PA JUMBF segment intact, so
the manifest still parses but its hash assertion no longer matches → the read's
`validation_status` reports a `.mismatch` → classified `tampered`, and the
`evidenceId` is still recoverable from the (unmodified) assertion, so the file
links back to its original record. The **strip** tamper mode re-encodes via sharp,
which drops the manifest entirely → classified `manifest_missing`, but the file is
re-linked to its record by **perceptual fingerprint** (soft binding), reported with
`MATCHED_BY_SOFT_BINDING` (advisory, not cryptographic).

## Verification statuses

`verified` · `tampered` · `manifest_missing` · `manifest_invalid` · `unknown`
(plus reason codes; see `packages/api/AGENTS.md` and `task.md` §6). These are
**response data**, not API errors — a tampered or unsigned image is a successful
`verify` call. The database links by `evidenceId` only; the C2PA verifier, not
the DB, decides validity.

## Key handling (security)

The private signing key is read **only** by the server-side signer. It is never
stored in the database, never returned by any API response, and never embedded in
exported outputs (asserted by an integration test). The committed demo key is a
public upstream test fixture, loudly labeled dev-only.

## Limitations

- **Untrusted dev certificates** — no real trust chain or timestamp authority, so
  results are "valid but untrusted."
- **Pixel-tamper heuristic** — patches a fixed offset into the JPEG scan; robust
  for the lab but not content-aware. JPEG-only: a `pixel` tamper on a PNG throws
  (sign/verify/`strip` still work for PNG).
- **In-memory uploads** — files are buffered in memory bounded by
  `MAX_UPLOAD_BYTES`; no streaming or virus scanning.
- **evidenceId sequence** — derived from the record count; fine locally, not
  safe under concurrent multi-instance writes.
- **Local disk storage** — images live on the server's `DATA_DIR`, not object
  storage.

## Production next steps

- Real certificate chain from a C2PA-recognised CA + a timestamp authority (TSA),
  and verification against the C2PA trust list (`verify_trust:true`).
- Object storage (S3/R2) for image bytes; stream uploads; add content scanning.
- Auth + per-user scoping; rate limiting on sign/verify.
- Content-aware tampering/diffing; PNG-aware pixel tamper and other-format support.
- Move signing behind a KMS/HSM so key material never touches application memory.
