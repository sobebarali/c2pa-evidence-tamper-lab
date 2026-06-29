# `sign` router (`sign`)

> Steps 2–4 — build the manifest from the evidence JSON, sign the original, extract the manifest, store the record. Full contract (Access/Input/Output/Errors/Side effects): [`../AGENTS.md`](../AGENTS.md). Taxonomy: [`../../AGENTS.md`](../../AGENTS.md).

## Hardest invariant

media is rebuilt server-side; the signed image reads back `verified` and the record persists; the private key never enters the output or the row.

## Links

- Tree: [`../AGENTS.md`](../AGENTS.md) · Integrations: [`../../integrations/AGENTS.md`](../../integrations/AGENTS.md)
