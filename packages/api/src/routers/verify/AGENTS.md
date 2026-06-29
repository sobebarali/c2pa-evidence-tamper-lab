# `verify` router (`verify`)

> Step 6 — read + verify an uploaded image, classify it, recover the evidenceId, link it back to a prior record. Full contract (Access/Input/Output/Errors/Side effects): [`../AGENTS.md`](../AGENTS.md). Taxonomy: [`../../AGENTS.md`](../../AGENTS.md).

## Hardest invariant

A tampered/unsigned image is a successful result (status + reasonCodes in the body), never an error — and an unexpected verifier failure degrades to status `unknown` (+`C2PA_VERIFIER_ERROR`) rather than throwing.

## Links

- Tree: [`../AGENTS.md`](../AGENTS.md) · Integrations: [`../../integrations/AGENTS.md`](../../integrations/AGENTS.md)
