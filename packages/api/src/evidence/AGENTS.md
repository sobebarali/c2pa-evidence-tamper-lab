# evidence (shared schema)

> The canonical evidence-JSON Zod schema (task.md §4) + builders. Imported by the `sign` router AND the web evidence editor (`schema.ts` is zod-only — no native/env deps). Contract: [`../../AGENTS.md`](../../AGENTS.md).

## Files

| File | Owns |
|------|------|
| `schema.ts` | `evidenceClaimsSchema` (user-editable draft / form + sign input), `evidenceSchema` (full canonical record, embedded + parsed back), sub-schemas (media/capture/gps/journalism/inspection/integrity), types. |
| `build.ts` | `formatEvidenceId(year, seq)` → `ev_YYYY_NNN`; `buildEvidence({ evidenceId, media, claims, createdAt })` → full `Evidence`. |

## Trust boundaries (task.md §4)

| Group | Source | Trust |
|-------|--------|-------|
| `media` | server (sharp/crypto over the stored original) | derived — never taken from the client |
| `capture` | EXIF and/or user edits (`gps.source` records which) | claim — bounded, validated |
| `journalism` / `inspection` | user-entered | claim — untrusted; bounded lengths; rendered escaped (no `dangerouslySetInnerHTML`) |
| `integrity` | server-stamped | system |

## Conventions (Rule → Why)

| Rule | Why |
|------|-----|
| `mode` discriminated union | journalism XOR inspection block; the other is `null` |
| missing EXIF/GPS ⇒ `null`, still valid | task.md §1/§3 — absence is honest, not invalid |
| string claims length-bounded | untrusted input; cap abuse; XSS inert via React escaping |
| `media` rebuilt server-side at sign | the client cannot forge file facts |

## Hardest invariant — round-trip integrity

`buildEvidence(validClaims)` always yields a value that `evidenceSchema.parse` accepts, and the parsed-back assertion on verify re-validates against the same schema.

## Links

- Contract: [`../../AGENTS.md`](../../AGENTS.md) · Sign router: [`../routers/sign/AGENTS.md`](../routers/sign/AGENTS.md)
