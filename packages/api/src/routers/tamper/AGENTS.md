# `tamper` router (`tamper`)

> Step 5 — produce a tampered copy of a signed image (`strip` removes the manifest, `pixel` patches the scan). Full contract (Access/Input/Output/Errors/Side effects): [`../AGENTS.md`](../AGENTS.md). Taxonomy: [`../../AGENTS.md`](../../AGENTS.md).

## Hardest invariant

`strip` → verify reports manifest_missing; `pixel` → verify reports tampered with evidenceId still recoverable.

## Links

- Tree: [`../AGENTS.md`](../AGENTS.md) · Integrations: [`../../integrations/AGENTS.md`](../../integrations/AGENTS.md)
