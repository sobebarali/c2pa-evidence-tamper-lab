# C2PA Evidence Tamper Lab

> _Original Pictures — Final Candidate Test_

_A local-first engineering assessment for content authenticity, evidence JSON, C2PA signing, database extraction, tamper generation, and tamper verification._

**Assessment summary:** The candidate must create an original image evidence record, embed the evidence JSON into a signed C2PA manifest, extract and store that manifest in a local database, generate a tampered version, upload it back, detect that it was modified, and link it back to the original evidence ID when possible.

## 1. Purpose of the Test

**This is not a generic coding exercise.** The test is designed to reveal whether a final engineering candidate can build a practical, local-first provenance workflow that is understandable to product, engineering, and compliance stakeholders.

- It does not require access to Original Pictures production servers.
- It forces the candidate to work with real C2PA tooling or SDKs rather than only mocking provenance.
- It produces visible outputs: signed image, evidence database, tampered image, verification result page, and reason codes.
- It checks whether the candidate understands the difference between valid, tampered, manifest-missing, and unknown states.
- It gives you meaningful live-edit opportunities during the final interview.

## 2. Allowed Implementation Paths

**Candidates may choose any one of the following implementation paths.** They should use a released/stable version, not an unreleased branch or private fork, unless they clearly explain why.

- C2PA CLI / c2patool released version.
- C2PA Node SDK, including `@contentauth/c2pa-node` or the current official Node path.
- C2PA Python library / bindings.
- C2PA Rust SDK / c2pa-rs.
- A mixed approach, for example Node backend plus c2patool, if they keep command execution safe.

**Important rule:** If they use a CLI from a backend, they must not build shell commands through string concatenation. They should use safe process invocation such as `execFile`/`spawn` with argument arrays, validate file paths, set timeouts, and isolate temporary files.

## 3. Required Main Workflow

### Step 1 — Upload Original Image

- User uploads an original JPEG or PNG image.
- The app calculates original file SHA-256, MIME type, file size, image dimensions, EXIF timestamp if available, and EXIF GPS if available.
- The app must not pretend missing EXIF/GPS means the file is invalid. Missing data should be represented honestly.

### Step 2 — Fill Evidence JSON

- The app creates an evidence JSON object with a stable `evidenceId`.
- The user can choose either Journalism mode or Inspection mode.
- The JSON should separate file-derived facts, user-entered claims, inferred values, and integrity information.
- User-entered fields must be treated as untrusted input.

### Step 3 — Create C2PA Manifest and Sign Image

- Create a C2PA manifest definition JSON from the evidence JSON.
- Embed the evidence JSON as a custom assertion or clearly documented C2PA assertion payload.
- Sign the image and output a new C2PA-signed image.
- The manifest must include claim generator name, title, action such as `c2pa.created`, `evidenceId`, original media hash, and mode.

### Step 4 — Extract Manifest and Store in Database

- After signing, read the signed image again and extract the C2PA manifest.
- Store the extracted record in a local database.
- The database should help link records, but it should not replace cryptographic validation.

### Step 5 — Tamper Page

- Create a page that takes a signed image and generates a tampered version.
- At minimum, implement one tamper method such as drawing text/rectangle, cropping, changing pixels, stripping the C2PA manifest, or attempting to change embedded evidence JSON.
- Best version: implement pixel tampering that preserves the C2PA manifest if possible, so verification can detect a content-hash mismatch.

### Step 6 — Re-upload Tampered Image and Verify

- User uploads the tampered image.
- The app runs C2PA extraction and verification.
- It detects whether the manifest is valid, invalid, missing, or tampered.
- It tries to recover `evidenceId` from the manifest if possible.
- It looks up the original database record by `evidenceId` and shows a clear result.

## 4. Evidence JSON Requirements

The evidence JSON should use a stable schema. The candidate may extend it, but the following fields should exist or be clearly mapped to equivalent fields.

```json
{
  "evidenceId": "ev_2026_001",
  "mode": "journalism",
  "media": {
    "sha256": "...",
    "mimeType": "image/jpeg",
    "fileSizeBytes": 123456,
    "width": 1920,
    "height": 1080
  },
  "capture": {
    "capturedAt": "2026-06-27T10:30:00Z",
    "gps": {
      "lat": 25.2048,
      "lng": 55.2708,
      "source": "exif | user | unknown",
      "confidence": "high | medium | low"
    },
    "cameraHeadingDegrees": 90,
    "cameraDirectionText": "east"
  },
  "journalism": {
    "reporterId": "rep_123",
    "organization": "Example Newsroom",
    "sourceType": "staff_reporter",
    "caption": "Street scene after the event",
    "publicInterestReason": "Newsworthy event documentation",
    "safetyNotes": ["Do not reveal exact GPS publicly"]
  },
  "inspection": null,
  "integrity": {
    "schemaVersion": "1.0",
    "createdBy": "Original Pictures Evidence Agent",
    "createdAt": "2026-06-27T10:35:00Z"
  }
}
```

For inspection mode, the JSON should include a meaningful inspection block:

```json
{
  "inspection": {
    "inspectionId": "insp_123",
    "claimId": "claim_456",
    "inspectorId": "inspector_789",
    "assetId": "property_001",
    "damageType": "water_damage",
    "observation": "Ceiling stain visible near window",
    "mapRequired": true
  }
}
```

## 5. Database Record Requirements

After signing and extracting the C2PA manifest, the app should store a local database record similar to this:

```json
{
  "evidenceId": "ev_2026_001",
  "mode": "journalism",
  "originalFileHash": "...",
  "signedFileHash": "...",
  "manifestLabel": "...",
  "claimGenerator": "Original Pictures Evidence Agent/1.0",
  "signatureStatus": "valid | invalid | unknown",
  "validationErrors": [],
  "extractedEvidenceJson": {},
  "createdAt": "2026-06-27T10:40:00Z"
}
```

**Design rule:** The database should not be the source of cryptographic truth. The C2PA verifier determines whether the file validates. The database helps link an uploaded file back to a prior Original Pictures evidence record.

## 6. Verification Statuses and Reason Codes

| Status             | Meaning                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verified`         | Manifest exists and C2PA validation succeeds.                                                                                                                    |
| `tampered`         | Manifest exists and `evidenceId` may be recoverable, but C2PA validation fails because signed content, hash assertion, manifest, or signature no longer matches. |
| `manifest_missing` | No C2PA manifest exists. The file may be unsigned or metadata may have been stripped.                                                                            |
| `manifest_invalid` | Manifest exists but cannot be parsed, has invalid signature, or contains malformed evidence JSON.                                                                |
| `unknown`          | Verifier failed or the app cannot confidently classify the result.                                                                                               |

Recommended reason codes:

```ts
type ReasonCode =
  | "C2PA_MANIFEST_MISSING"
  | "C2PA_MANIFEST_PARSE_FAILED"
  | "C2PA_SIGNATURE_INVALID"
  | "C2PA_TRUST_UNVERIFIED"
  | "HASH_ASSERTION_MISMATCH"
  | "EVIDENCE_JSON_SCHEMA_INVALID"
  | "EVIDENCE_ID_NOT_FOUND_IN_DB"
  | "MATCHED_PRIOR_EVIDENCE_RECORD";
```

## 7. Expected Verification Outputs

If the tampered file still contains a readable manifest and `evidenceId`, the result should look like this:

```json
{
  "uploadedFileStatus": "tampered",
  "matchedEvidenceId": "ev_2026_001",
  "matchedOriginalRecord": true,
  "reasonCodes": [
    "C2PA_VALIDATION_FAILED",
    "HASH_ASSERTION_MISMATCH",
    "MATCHED_PRIOR_EVIDENCE_RECORD"
  ],
  "originalSignedFileHash": "...",
  "uploadedTamperedFileHash": "...",
  "message": "This file appears to be derived from a previously signed Original Pictures evidence record, but the signed content no longer matches."
}
```

If the manifest was stripped, the result should not pretend to know the original ID:

```json
{
  "uploadedFileStatus": "manifest_missing",
  "matchedEvidenceId": null,
  "matchedOriginalRecord": false,
  "reasonCodes": ["C2PA_MANIFEST_MISSING"],
  "message": "No C2PA manifest was found. The file cannot be linked to a signed Original Pictures evidence record."
}
```

## 8. Required UI Pages

| #   | Page                      | Purpose                                                                                  |
| --- | ------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Upload original image     | Upload JPEG/PNG and show basic file facts.                                               |
| 2   | Evidence JSON editor      | Fill or edit journalism/inspection evidence fields.                                      |
| 3   | Journalism view           | Reporter/source, caption, public-interest reason, privacy/safety notes, location source. |
| 4   | Inspection view           | Inspection ID, claim ID, asset ID, map/GPS, camera direction, observation/damage notes.  |
| 5   | Sign with C2PA            | Create manifest and output signed image.                                                 |
| 6   | Evidence records database | List stored `evidenceId`, mode, hashes, manifest label, status.                          |
| 7   | Tamper image page         | Create tampered image from signed image.                                                 |
| 8   | Re-upload / verify page   | Upload tampered/signed image and run verification.                                       |
| 9   | Verification result page  | Show status, reason codes, linked original record, and explanation.                      |

## 9. C2PA Implementation Notes

- The candidate may use C2PA CLI, Node, Python, or Rust.
- The implementation should add a manifest to the image, read the manifest back, and verify it.
- If a feature is mocked because of library limitations, the candidate must explain exactly what is mocked and what is real.
- If using demo certificates or local signing keys, they must state clearly that this is development-only and not production-grade.
- Private keys must not be stored in the database, returned from the API, embedded in exported outputs, or committed to source control except for clearly labeled demo fixtures.

```bash
# Example CLI style only; candidates may implement with SDKs instead.
c2patool original.jpg -m manifest.json -o signed.jpg
c2patool signed.jpg --info
c2patool signed.jpg -d
```

## 10. Suggested Architecture

```
frontend/
  upload-original
  evidence-editor
  journalism-view
  inspection-view
  sign
  records
  tamper
  verify
backend/
  routes/
    upload.ts / upload.py / equivalent
    sign.ts
    verify.ts
    tamper.ts
    records.ts
  services/
    evidenceSchema
    imageMetadata
    c2paSigner
    c2paReader
    c2paVerifier
    tamperService
    recordsDb
    hash
  db/
    schema.sql or local JSON/SQLite schema
examples/
  original.jpg
  evidence.json
  manifest.json
  signed.jpg
  tampered.jpg
```

## 11. Required Tests

1. Evidence JSON schema validation.
2. C2PA manifest creation from evidence JSON.
3. Signed image record is stored in the database.
4. Manifest extraction recovers `evidenceId`.
5. Valid signed image verifies successfully.
6. Tampered image is not marked as verified.
7. Tampered image links back to original `evidenceId` when the manifest remains readable.
8. Manifest-stripped image is reported as `manifest_missing`, not verified.
9. Malicious evidence JSON text does not execute in UI or PDF output.
10. Private signing key is not stored in the database or returned by the API.

## 12. Candidate Deliverables

1. Source code.
2. README with setup instructions.
3. Example original image.
4. Example evidence JSON.
5. Example C2PA manifest JSON.
6. Example signed image.
7. Example tampered image.
8. Screenshot or short video of the workflow.
9. Database seed/export showing the signed record.
10. `DECISIONS.md` explaining what is real, what is mocked, which C2PA tool/library was used, how tampering was detected, limitations, and production next steps.

## 13. Reference Notes for Interviewer

These are useful references for framing the assessment. The candidate is allowed to use official documentation during the task.

- C2PA Tool / c2patool documentation: https://opensource.contentauthenticity.org/docs/c2patool/
- CAI open-source community resources listing Rust, CLI, Python, Node, and other libraries: https://opensource.contentauthenticity.org/docs/community-resources/
- C2PA Python library documentation: https://opensource.contentauthenticity.org/docs/c2pa-python/
- C2PA Rust SDK documentation: https://opensource.contentauthenticity.org/docs/rust-sdk/
- C2PA Tool manifest definition documentation: https://github.com/contentauth/c2patool/blob/main/docs/manifest.md
