# Verilio

Verilio is a focused time-tracking, reporting, and invoicing workspace for a
solo freelancer.

The MVP is a TypeScript modular monolith: a React/Vite web app, a Fastify API,
PostgreSQL with checked-in Drizzle migrations, shared Zod contracts, and a
server-side Invoice PDF renderer.

## Release boundary

This repository currently runs in documented **local/private fixed-owner
mode**. `LOCAL_USER_ID` selects the one server-controlled owner; browser
requests never supply an owner ID.

Do not expose this build directly to the public Internet. Authentication,
secure sessions, and a public-hosted authorization boundary must be selected
and implemented before a public SaaS deployment. The current release gate
means the private/local MVP is technically complete; it does not mean public
SaaS launch readiness.

## Requirements

- Node.js 22 or newer
- pnpm 9
- Docker with Compose, or an equivalent PostgreSQL 17 instance

## Fresh setup

```sh
cp .env.example .env
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

The web app runs at `http://127.0.0.1:5173`. Vite proxies `/api` and `/health`
to the Fastify API at `http://127.0.0.1:3000`.

No seed data is required. Open Settings first and save the Business profile,
then create a Client, Project, and optional Tasks.

## Environment

Server variables are validated at startup:

- `DATABASE_URL` — PostgreSQL URL used for development and as the production fallback
- `DATABASE_URL_FILE` — optional server-side secret file; when set, it deterministically takes
  precedence over `DATABASE_URL`
- `API_HOST` — defaults to `127.0.0.1`
- `API_PORT` — defaults to `3000`
- `LOCAL_USER_ID` — fixed private/local owner UUID; defaults to the development owner
- `LOG_LEVEL` — Pino level; defaults to `info`

Only server configuration belongs in these values. Never expose database
credentials through Vite browser variables.

## Health and readiness

With the API running:

```sh
curl -f http://127.0.0.1:3000/health/live
curl -f http://127.0.0.1:3000/health/ready
```

Liveness verifies the process. Readiness also verifies PostgreSQL connectivity.

## Repository checks

```sh
pnpm db:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
git diff --check
```

Integration tests use dedicated owners. Playwright uses a separate fixed E2E
owner, removes that owner's fixtures before and after the suite, and remains
serial because the running application intentionally exposes one owner.

`pnpm db:generate` should report no schema changes unless a migration is
actually required. Apply every real generated migration with `pnpm db:migrate`
after reviewing its ordering, backfills, constraints, and indexes.

## Production-build smoke check

Build first, then run the compiled API and Vite's static preview in separate
terminals:

```sh
pnpm build
pnpm --filter @verilio/api start
VITE_API_TARGET=http://127.0.0.1:3000 pnpm --filter @verilio/web preview --host 127.0.0.1 --port 4173
```

Verify the app at `http://127.0.0.1:4173` and both health endpoints through the
preview origin. Vite preview is a local smoke-test server, not the recommended
production web server.

## Private alpha deployment

The reproducible Docker/Tailscale deployment for a low-resource private host is
documented in [docs/08-private_alpha_self_hosted_deployment.md](docs/08-private_alpha_self_hosted_deployment.md).

The production runtime uses prebuilt `linux/amd64` images, Caddy behind
Tailscale Serve, a one-shot migration container, and PostgreSQL 17 with a named
volume. The runtime host does not need Node.js, pnpm, source code, or a container
build toolchain.

Build-host entry points:

```sh
./deploy/build-release.sh <git-tag>
./deploy/test-release.sh <git-tag>
./deploy/export-release.sh <git-tag>
```

These commands do not publish images or deploy anything to a public service.

## Migration history notes

- The M6 Time Entry currency migration backfills older completed billable Time
  from each entry's currently associated Client currency. This is a one-time
  best effort because currency history from before the snapshot field existed
  cannot be reconstructed.
- The M8 Invoice presentation migration backfills saved payment terms and
  footer from the current Business profile, with a 30-day fallback where no
  profile value exists. This is likewise a one-time best effort for pre-M8
  Drafts.

For a private/self-hosted deployment, back up PostgreSQL before upgrades (for
example with `pg_dump`) and test restores for the chosen environment. Logo/file
storage is optional and is not required for Invoice PDF generation.

The product and engineering decisions live in `docs/01` through `docs/07`.
