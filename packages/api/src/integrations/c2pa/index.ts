import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "@c2pa-evidence-tamper-lab/env/server";
import {
  Builder,
  createTrustSettings,
  createVerifySettings,
  LocalSigner,
  mergeSettings,
  Reader,
} from "@contentauth/c2pa-node";
import type {
  ManifestStore,
  ValidationResults,
  ValidationState,
  ValidationStatus,
} from "@contentauth/c2pa-types";

import type { Evidence } from "../../evidence/schema";

// Custom assertion label embedding the evidence JSON (reverse-DNS).
export const EVIDENCE_ASSERTION_LABEL = "com.originalpictures.evidence";
// Identity-binding assertion. This is a CAWG-shaped identity binding carried as a
// claim-signed assertion (covered by the manifest signature), NOT a separately
// COSE-signed CAWG credential — c2pa-node 0.6.0's IdentityAssertionSigner
// corrupts the claim signature with a local ES256 callback. See DECISIONS.md.
export const IDENTITY_ASSERTION_LABEL = "com.originalpictures.identity";
const CLAIM_GENERATOR_NAME = "Original Pictures Evidence Agent";
const CLAIM_GENERATOR_VERSION = "1.0";

export type VerifyStatus =
  | "verified"
  | "tampered"
  | "manifest_missing"
  | "manifest_invalid"
  | "unknown";

export type SignatureStatus = "valid" | "invalid" | "unknown";

// ponytail: dev/test default resolves the demo certs relative to this file (5
// dirs up to the repo root). Production sets C2PA_*_PATH env overrides — the
// bundled build won't have this source path.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..", "..");
const certPath =
  env.C2PA_SIGN_CERT_PATH ??
  join(repoRoot, "fixtures/dev-certs/es256_certs.pem");
const keyPath =
  env.C2PA_PRIVATE_KEY_PATH ??
  join(repoRoot, "fixtures/dev-certs/es256_private.key");

// Memoized claim signer over the demo cert/key. The key is loaded once and never
// leaves this module — never stored, returned, or exported (task.md §9).
let signerPromise: ReturnType<typeof LocalSigner.newSigner> | null = null;

async function getSigner() {
  if (!signerPromise) {
    const [cert, key] = await Promise.all([
      readFile(certPath),
      readFile(keyPath),
    ]);
    signerPromise = LocalSigner.newSigner(cert, key, "es256");
  }
  return signerPromise;
}

// Builds the identity-binding assertion from the evidence claims: who produced
// the asset, bound (by reference) to the evidence assertion and covered by the
// manifest signature.
function buildIdentityAssertion(evidence: Evidence) {
  const actor =
    evidence.mode === "journalism"
      ? {
          role: "reporter",
          id: evidence.journalism.reporterId,
          organization: evidence.journalism.organization,
        }
      : {
          role: "inspector",
          id: evidence.inspection.inspectorId,
          organization: null,
        };
  return {
    profile: "cawg.identity (modeled — claim-signed)",
    referencedAssertions: [EVIDENCE_ASSERTION_LABEL],
    namedActor: actor,
  };
}

export interface SignResult {
  claimGenerator: string | null;
  manifestLabel: string | null;
  signatureStatus: SignatureStatus;
  signedBytes: Buffer;
}

export async function signImage(input: {
  bytes: Buffer;
  mime: string;
  title: string;
  evidence: Evidence;
}): Promise<SignResult> {
  const signer = await getSigner();
  const builder = Builder.withJson({
    claim_generator_info: [
      { name: CLAIM_GENERATOR_NAME, version: CLAIM_GENERATOR_VERSION },
    ],
    title: input.title,
    assertions: [
      {
        label: "c2pa.actions",
        data: { actions: [{ action: "c2pa.created" }] },
      },
      { label: EVIDENCE_ASSERTION_LABEL, data: input.evidence },
      {
        label: IDENTITY_ASSERTION_LABEL,
        data: buildIdentityAssertion(input.evidence),
      },
    ],
  });

  const dest: { buffer: Buffer | null; mimeType: string } = {
    buffer: null,
    mimeType: input.mime,
  };
  builder.sign(signer, { buffer: input.bytes, mimeType: input.mime }, dest);
  if (!dest.buffer) {
    throw new Error("c2pa signing produced no output");
  }
  const signedBytes = Buffer.from(dest.buffer);

  const read = await readManifest(signedBytes, input.mime);
  return {
    signedBytes,
    manifestLabel: read.manifestLabel,
    claimGenerator: read.claimGenerator,
    signatureStatus: isInvalidRead(read) ? "invalid" : "valid",
  };
}

// Memoized reader settings. Trust verification is env-driven; the lab default is
// OFF — the demo certs chain to no anchor, so untrusted ≠ tampered. Flip
// C2PA_VERIFY_TRUST (+ optional C2PA_TRUST_ANCHORS_PATH) to verify a real chain.
let readerSettingsPromise: ReturnType<typeof buildReaderSettings> | null = null;

async function buildReaderSettings() {
  const trustAnchors = env.C2PA_TRUST_ANCHORS_PATH
    ? await readFile(env.C2PA_TRUST_ANCHORS_PATH, "utf8")
    : undefined;
  return mergeSettings(
    createVerifySettings({
      verifyAfterReading: true,
      verifyTrust: env.C2PA_VERIFY_TRUST,
    }),
    createTrustSettings({
      verifyTrustList: env.C2PA_VERIFY_TRUST,
      trustAnchors,
    })
  );
}

function getReaderSettings() {
  if (!readerSettingsPromise) {
    readerSettingsPromise = buildReaderSettings();
  }
  return readerSettingsPromise;
}

export interface ReadResult {
  claimGenerator: string | null;
  evidence: unknown;
  hasC2paBytes: boolean;
  hasIdentity: boolean;
  hasManifest: boolean;
  identitySignerName: string | null;
  manifestLabel: string | null;
  parseFailed: boolean;
  // C2PA v2 surface — preferred by classify(); null on v1 assets.
  validationResults: ValidationResults | null;
  validationState: ValidationState | null;
  // Legacy v1 surface (may be empty on v2 assets).
  validationStatus: ValidationStatus[];
}

export async function readManifest(
  bytes: Buffer,
  mime: string
): Promise<ReadResult> {
  const hasC2paBytes = containsC2pa(bytes);
  let reader: Reader | null = null;
  try {
    reader = await Reader.fromAsset(
      { buffer: bytes, mimeType: mime },
      await getReaderSettings()
    );
  } catch {
    return emptyRead({ parseFailed: true, hasC2paBytes });
  }
  if (!reader) {
    return emptyRead({ parseFailed: false, hasC2paBytes });
  }

  const store: ManifestStore = reader.json();
  const activeLabel = store.active_manifest ?? null;
  const active = activeLabel ? store.manifests?.[activeLabel] : undefined;
  if (!(activeLabel && active)) {
    return emptyRead({ parseFailed: false, hasC2paBytes });
  }

  const evidenceAssertion = active.assertions?.find(
    (a) => a.label === EVIDENCE_ASSERTION_LABEL
  );
  const identityAssertion = active.assertions?.find(
    (a) => a.label === IDENTITY_ASSERTION_LABEL
  );
  const identityActor = (
    identityAssertion?.data as
      | { namedActor?: { id?: string; organization?: string | null } }
      | undefined
  )?.namedActor;
  const claimGenerator =
    active.claim_generator_info?.[0]?.name ?? active.claim_generator ?? null;

  return {
    hasManifest: true,
    manifestLabel: activeLabel,
    claimGenerator,
    evidence: evidenceAssertion?.data ?? null,
    hasIdentity: identityAssertion !== undefined,
    identitySignerName:
      identityActor?.organization ?? identityActor?.id ?? null,
    validationStatus: store.validation_status ?? [],
    validationResults: store.validation_results ?? null,
    validationState: store.validation_state ?? null,
    parseFailed: false,
    hasC2paBytes,
  };
}

export interface Classification {
  reasonCodes: string[];
  status: VerifyStatus;
}

// Failure status codes, preferring the C2PA v2 surface (validation_results) and
// falling back to legacy validation_status for v1 assets.
function collectFailureCodes(read: ReadResult): string[] {
  const fromResults =
    read.validationResults?.activeManifest?.failure?.map((s) => s.code) ?? [];
  const fromLegacy = read.validationStatus
    .filter((s) => s.success !== true)
    .map((s) => s.code);
  return [...fromResults, ...fromLegacy];
}

// A manifest is invalid when v2 validation_state says so, or (on v1 assets with
// no state) when any failure code is present.
function isInvalidRead(read: ReadResult): boolean {
  if (read.validationState) {
    return read.validationState === "Invalid";
  }
  return collectFailureCodes(read).length > 0;
}

// Maps a read result to the verification status + reason codes (task.md §6).
// A tampered or unsigned image is a SUCCESSFUL classification, never an error.
export function classify(read: ReadResult): Classification {
  if (!read.hasManifest) {
    if (read.parseFailed && read.hasC2paBytes) {
      return {
        status: "manifest_invalid",
        reasonCodes: ["C2PA_MANIFEST_PARSE_FAILED"],
      };
    }
    return {
      status: "manifest_missing",
      reasonCodes: ["C2PA_MANIFEST_MISSING"],
    };
  }

  if (!isInvalidRead(read)) {
    // "Trusted" means the cert chained to a configured anchor; otherwise the
    // demo certs are intentionally untrusted in dev — surfaced honestly.
    return read.validationState === "Trusted"
      ? { status: "verified", reasonCodes: [] }
      : { status: "verified", reasonCodes: ["C2PA_TRUST_UNVERIFIED"] };
  }

  const failureCodes = collectFailureCodes(read);
  const reasonCodes = ["C2PA_VALIDATION_FAILED"];
  if (failureCodes.some((c) => c.includes("mismatch"))) {
    reasonCodes.push("HASH_ASSERTION_MISMATCH");
  }
  if (failureCodes.some((c) => SIGNATURE_FAILURE_CODE.test(c))) {
    reasonCodes.push("C2PA_SIGNATURE_INVALID");
  }
  return { status: "tampered", reasonCodes };
}

function emptyRead(opts: {
  parseFailed: boolean;
  hasC2paBytes: boolean;
}): ReadResult {
  return {
    hasManifest: false,
    manifestLabel: null,
    claimGenerator: null,
    evidence: null,
    hasIdentity: false,
    identitySignerName: null,
    validationStatus: [],
    validationResults: null,
    validationState: null,
    parseFailed: opts.parseFailed,
    hasC2paBytes: opts.hasC2paBytes,
  };
}

const SIGNATURE_FAILURE_CODE = /sign/i;
const C2PA_MARKER = Buffer.from("c2pa");
function containsC2pa(bytes: Buffer): boolean {
  return bytes.includes(C2PA_MARKER);
}
