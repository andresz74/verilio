# Verilio

Verilio is a focused time-tracking, reporting, and invoicing workspace for a
solo freelancer.

The MVP is a TypeScript modular monolith: a React/Vite web app, a Fastify API,
PostgreSQL with checked-in Drizzle migrations, shared Zod contracts, and a
server-side Invoice PDF renderer.

## Project status and safety

The private/local fixed-owner MVP is technically complete and is being
dogfooded as a private alpha. Public SaaS authentication, secure sessions,
and the public-hosting authorization boundary are not implemented.

This repository currently runs in documented **local/private fixed-owner
mode**. `LOCAL_USER_ID` selects the one server-controlled owner; browser
requests never supply an owner ID.

**Do not expose this build directly to the public Internet.** Authentication,
secure sessions, and a public-hosted authorization boundary must be selected
and implemented before a public SaaS deployment. Technical MVP completion
does not imply public SaaS readiness.

## Ways to run Verilio

| Workflow | Purpose | Requirements |
| --- | --- | --- |
| [Local development / evaluation](#local-quick-start) | Run locally as a reviewer or developer; multi-step setup. | Node.js 22+, pnpm 9, Docker Compose or PostgreSQL 17. |
| [Private-alpha snapshot](#private-alpha-deployment) | Update an already-configured private host from exact fetched `origin/main`. | Git, local Docker with buildx/Compose, deployment-user permissions, and existing host configuration. Not a fresh-server installer. |
| [Official tagged release](#official-release-workflow) | Build/test/export a strict immutable release off-host. | Clean tagged source and full release gate on the build machine; Docker Compose on the runtime destination. |

## Local quick start

Requirements:

- Node.js 22 or newer
- pnpm 9
- Docker with Compose, or an equivalent PostgreSQL 17 instance

From the repository root:

```sh
cp .env.example .env
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

The web app runs at `http://127.0.0.1:5173`. Vite proxies `/api` and `/health`
to the Fastify API at `http://127.0.0.1:3000`.

### First use

No seed data is required:

1. Open Settings.
2. Save the Business profile.
3. Create a Client.
4. Create a Project.
5. Optionally create Tasks.
6. Start tracking time.

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

With the local API running on its default port:

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
pnpm test:deploy
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

See the [private-alpha deployment runbook](docs/08-private_alpha_self_hosted_deployment.md)
for first-time host preparation, secrets, private ingress, backups, restore,
rollback, and snapshot deployment details. The NC110 is the documented
low-resource host example, not an application dependency. Tailscale Serve is
an example private ingress; another private VPN/reverse proxy can replace it.

The runtime uses versioned `linux/amd64` API/Caddy images, a one-shot migration
container, and PostgreSQL 17 with a persistent named volume. With an official
prebuilt release, the destination host needs no Node.js, pnpm, source code,
or container build toolchain.

The optional **snapshot** path instead uses Git and Docker buildx/Compose to
build on an already-configured private Linux host. After the runbook's one-time
setup, run as the deployment user (not with sudo):

```sh
cd /srv/verilio/source
./deploy/nc110-deploy-main.sh
```

This fetches exact `origin/main`, builds in a detached worktree, and deploys an
immutable `main-<sha>` snapshot (12-character prefix; full SHA in the manifest).
It creates no Git tag and is **private dogfooding, not an official release or
a fresh-server installer**. No host Node/pnpm toolchain is required; Docker
performs the build. Snapshot deployment does not replace the full release gate.

## Official release workflow

Build and test off-host on the development machine (OrbStack is preferred).
Run the repository checks above and the full disposable production release
gate below. Start from a clean commit with a matching immutable Git tag;
replace `<git-tag>` with that tag, never `latest`. Do not use the unreleased-build
override for official releases.

```sh
./deploy/build-release.sh <git-tag>
./deploy/test-release.sh <git-tag>
./deploy/export-release.sh <git-tag>
```

The release gate exercises production startup/migrations, health, Chromium,
restart persistence, backup, and restore. Export produces the checksummed image
archive and deployment bundle for the runtime host; follow the runbook for
transfer and installation. These commands do not publish images or deploy to
a public service.

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
