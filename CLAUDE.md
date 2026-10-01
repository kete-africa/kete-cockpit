# Kete Cockpit — project context

> The single place where this repository's context lives. `AGENTS.md` points here.

Kete Cockpit is where Kete operators run the Kete apps: the offers catalog, the app registry, their
events and health, the brief. It left kete-core for this repository (doctrine D-033, kete-core spec
030), with its history; it consumes kete-core's published packages (`@kete-africa/*`), never a
branch (D-034).

## Read before any action

1. The Kete doctrine (`kete-africa/kete`): `docs/PRINCIPES.md`, `docs/CONCEPTION.md`,
   `docs/ARCHITECTURE_APP.md`, `docs/DECISIONS.md` (D-019, D-022, D-033, D-034).
2. `README.md` — what the Cockpit does, how to run it and deploy it.

## Branches

`main` production (the human gesture only), `dev` integration (green CI), `NNN-slug` one feature.

## Forbidden to agents

- Pushing to `main` or `dev` directly; writing a secret in a file, a message or a commit.
- Creating a table without its RLS policy in the same migration; hard-coding a user-visible string.
- Shipping a behavior change without its documentation and diagram.
