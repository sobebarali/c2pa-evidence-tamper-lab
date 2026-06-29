import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "@c2pa-evidence-tamper-lab/env/server";
import { Builder, LocalSigner, Reader } from "@contentauth/c2pa-node";
import type { ManifestStore, ValidationStatus } from "@contentauth/c2pa-types";

import type { Evidence } from "../../evidence/schema";

// Custom assertion label embedding the evidence JSON (reverse-DNS).
export const EVIDENCE_ASSERTION_LABEL = "com.originalpictures.evidence";
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
    signatureStatus: read.validationStatus.length === 0 ? "valid" : "invalid",
  };
}

export interface ReadResult {
  claimGenerator: string | null;
  evidence: unknown;
  hasC2paBytes: boolean;
  hasManifest: boolean;
  manifestLabel: string | null;
  parseFailed: boolean;
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
      { verify: { verify_after_reading: true, verify_trust: false } }
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
  const claimGenerator =
    active.claim_generator_info?.[0]?.name ?? active.claim_generator ?? null;

  return {
    hasManifest: true,
    manifestLabel: activeLabel,
    claimGenerator,
    evidence: evidenceAssertion?.data ?? null,
    validationStatus: store.validation_status ?? [],
    parseFailed: false,
    hasC2paBytes,
  };
}

export interface Classification {
  reasonCodes: string[];
  status: VerifyStatus;
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

  if (read.validationStatus.length === 0) {
    // demo certs are intentionally untrusted in dev — surfaced honestly.
    return { status: "verified", reasonCodes: ["C2PA_TRUST_UNVERIFIED"] };
  }

  const reasonCodes = ["C2PA_VALIDATION_FAILED"];
  if (read.validationStatus.some((s) => s.code.includes("mismatch"))) {
    reasonCodes.push("HASH_ASSERTION_MISMATCH");
  }
  if (read.validationStatus.some((s) => SIGNATURE_FAILURE_CODE.test(s.code))) {
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
    validationStatus: [],
    parseFailed: opts.parseFailed,
    hasC2paBytes: opts.hasC2paBytes,
  };
}

const SIGNATURE_FAILURE_CODE = /sign/i;
const C2PA_MARKER = Buffer.from("c2pa");
function containsC2pa(bytes: Buffer): boolean {
  return bytes.includes(C2PA_MARKER);
}
