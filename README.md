# Kete Cockpit (`apps/cockpit`)

Where Kete operators run the Kete apps (doctrine step 1, decision D-022). Operators sign in with
their Compte Kete; they manage the **offers catalog** that clients buy from in Mon espace Kete, and
the **app registry**: each app's health and the events it delivers. The morning brief and agent
access come next (see the roadmap).

## Screens

| Path           | What it is for                                                                           |
| -------------- | ---------------------------------------------------------------------------------------- |
| `/apps`        | Registered apps: health, version, events of the last 24 h; register one (key shown once) |
| `/apps/$appId` | Health history, check now, latest events, signing keys and rotation                      |
| `/api/events`  | Where apps deliver their signed events (`@kete/sdk` relay)                               |
| `/offres`      | Offers on sale or withdrawn; the store's products not yet offered                        |
| `/refus`       | Why someone cannot enter (not an operator, no second factor)                             |
| `/au-revoir`   | After signing out of the Cockpit                                                         |
| `/auth/*`      | Sign-in with the Compte Kete (start, callback, sign-out)                                 |
| `/health`      | Liveness                                                                                 |

## How it works

```mermaid
sequenceDiagram
  participant O as Operator
  participant K as Kete Cockpit
  participant C as Compte Kete
  participant P as Payment provider
  O->>K: /offres
  K-->>O: not signed in → Compte Kete (password, then the code of the authenticator app)
  O->>C: signs in
  C-->>K: code → token (org, role, two_factor)
  K->>K: operator? Kete's organization, owner/admin, second factor
  K->>C: GET /api/admin/offers (operator's token, server-side only)
  C->>C: operator again, in its database
  C->>P: list products
  C-->>K: products and offers
  O->>K: offer a product (app, days, grace)
  K->>C: POST /api/admin/offers
  C->>P: product price (the reference)
  C->>C: admin_set_offer (definer function)
```

- **One account**: the Cockpit has no passwords; it signs operators in with `@kete/auth`
  (`createKeteSignIn`, `keepAccessToken`). The token stays in the Cockpit's signed HttpOnly cookie
  and is only used server-side; the session ends with the token (15 min) and renews silently
  through the Compte Kete.
- **Operators**: owners or admins of `KETE_OPERATORS_ORGANIZATION_ID`, with two-factor on — checked
  by the Cockpit, and again by the Compte Kete on every admin call.
- **Its own database** (Neon `kete-cockpit`): registry, keys (secrets encrypted at rest), health
  readings, received events — Kete's operating data, decision 0004.
- **Health** is read every `COCKPIT_PROBE_INTERVAL_SECONDS` (default 300) by one instance at a time.

```mermaid
flowchart LR
  App[Kete app<br/>@kete/sdk outbox + relay] -->|signed batch, kid| E[/api/events/]
  E --> R{key ring + declared types}
  R -->|once| T[(kete_received_events)]
  C[Cockpit scheduler] -->|GET /health| App
  C --> P[(probes)]
  O[Operator] -->|register address| M[/.well-known/kete/]
  M --> A[(apps + app_keys)]
```

## Run locally

`apps/cockpit/.env` (see `.env.example`) with the Compte Kete running on port 3100 and the Cockpit
registered there (`pnpm --filter @kete/account clients create …`, redirect
`http://127.0.0.1:3300/auth/callback`).

```bash
pnpm --filter @kete/cockpit dev
```

## Tests

- `tests/registry.test.ts` (Neon `test`, a witness app): registration and its refusals, health
  readings, events accepted once, forged/foreign/undeclared/retired-key deliveries refused.
- `e2e/cockpit.spec.ts` (production builds of both apps, Neon `test`, a fake payment provider): an
  operator signs in with two-factor, offers a product that a client then sees in Mon espace Kete,
  withdraws it; registers the Compte Kete, reads it healthy and sees a signed event; a client of
  Kete is refused.

```bash
pnpm --filter @kete/cockpit test:e2e
```

## Deploy

`apps/cockpit/Dockerfile` (context at the repository root). Environment: `KETE_ACCOUNT_URL`,
`COCKPIT_URL`, `COCKPIT_CLIENT_ID`, `COCKPIT_CLIENT_SECRET`, `COCKPIT_SESSION_SECRET`,
`KETE_OPERATORS_ORGANIZATION_ID`, `COCKPIT_DATABASE_URL`, `COCKPIT_ENCRYPTION_KEY`,
`COCKPIT_PROBE_INTERVAL_SECONDS`. Migrations (owner role) before deploy:
`COCKPIT_OWNER_URL=… pnpm --filter @kete/cockpit db:migrate`.
