# ⚠️ DEV / TEST ONLY — NOT A REAL CREDENTIAL

These are the **public ES256 demo signing fixtures** from the C2PA reference
implementation ([`contentauth/c2pa-rs`](https://github.com/contentauth/c2pa-rs/tree/main/sdk/tests/fixtures/certs),
`es256.pub` → `es256_certs.pem`, `es256.pem` → `es256_private.key`). They are
checked in **on purpose** so the lab signs out of the box.

- `es256_certs.pem` — the certificate chain (end-entity → intermediate).
- `es256_private.key` — the matching ES256 (P-256) private key.

**Why this is safe to commit:** this key is published in a public upstream test
suite — it is not secret, has no value, and chains to no real trust anchor.
Content Credentials produced with it are **structurally valid but untrusted**:
verification runs with `verify_trust: false`, so "untrusted dev cert" is never
mistaken for tampering.

**Hard rules (enforced in code):** this key is read only by the server-side
signer. It is **never** stored in the database, **never** returned by any API
response, and **never** embedded in exported outputs. Production must swap in a
real cert chain (and ideally a timestamp authority) via the `C2PA_SIGN_CERT` /
`C2PA_PRIVATE_KEY` env overrides — never this fixture.
