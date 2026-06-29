import type { Evidence, EvidenceClaims, Media } from "./schema";

const SCHEMA_VERSION = "1.0";
const CREATED_BY = "Original Pictures Evidence Agent";

// ev_YYYY_NNN (task.md §4). Sequence is computed by the sign router from the DB
// count so ids stay stable and human-readable.
export function formatEvidenceId(year: number, seq: number): string {
  return `ev_${year}_${String(seq).padStart(3, "0")}`;
}

// Assemble the canonical evidence JSON from validated user claims + the
// server-derived media facts. media is NEVER taken from the client.
export function buildEvidence(args: {
  evidenceId: string;
  media: Media;
  claims: EvidenceClaims;
  createdAt: string;
}): Evidence {
  const { evidenceId, media, claims, createdAt } = args;
  const integrity = {
    schemaVersion: SCHEMA_VERSION,
    createdBy: CREATED_BY,
    createdAt,
  } as const;

  if (claims.mode === "journalism") {
    return {
      evidenceId,
      mode: "journalism",
      media,
      capture: claims.capture,
      journalism: claims.journalism,
      inspection: null,
      integrity,
    };
  }

  return {
    evidenceId,
    mode: "inspection",
    media,
    capture: claims.capture,
    journalism: null,
    inspection: claims.inspection,
    integrity,
  };
}
