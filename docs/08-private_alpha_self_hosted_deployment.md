# Verilio Private Alpha Self-Hosted Deployment

## 1. Scope and safety boundary

This runbook deploys the fixed-local-owner Verilio MVP to a private Samsung NC110 running
Ubuntu Server 24.04.3 LTS. The host is runtime-only; release images are built and tested on the
development computer through OrbStack.

> **Private deployment only:** this Verilio build is intended for trusted private-network or
> tailnet access. Do not expose it as an unauthenticated public Internet application. Use
> Tailscale Serve, not Tailscale Funnel.

Tailscale is an ingress example, not an application dependency. WireGuard, Headscale, a private
LAN, or another private reverse proxy may replace it without changing Verilio domain code.

## 2. Runtime architecture

```text
Personal device
      │ private HTTPS
      ▼
Tailscale Serve on the NC110 host
      │ http://127.0.0.1:8080
      ▼
Caddy gateway container
  ├── /          → immutable React assets
  ├── /api/*     → Fastify on the private Compose network
  └── /health/*  → Fastify on the private Compose network
                         │
                         ▼
                   PostgreSQL 17
                   verilio_pgdata
```

Long-running host service: Tailscale.

Long-running Compose services: `gateway`, `api`, and `postgres`.

One-shot Compose service: `migrate`. It uses the API image and exits after applying the
checked-in migrations. The API and PostgreSQL have no published host ports. Caddy publishes only
`127.0.0.1:8080` by default.

## 3. NC110 host preparation

Install Ubuntu updates, Docker Engine, and the Docker Compose plugin using their official Ubuntu
instructions. The account performing deployments must be able to use Docker. Membership in the
`docker` group is effectively root access; restrict it accordingly.

Suggested directories:

```text
/opt/verilio/releases/<version>/  extracted immutable release
/opt/verilio/current              symlink to active release
/etc/verilio/verilio.env          non-secret runtime configuration
/etc/verilio/secrets/             mode 0700, root-owned secret files
/srv/verilio/backups/             mode 0700, local backup retention
```

### Swap for 2 GB RAM

A 4 GB swap file provides protection for occasional PDF or archive-decompression peaks without
requiring tight container limits:

```sh
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
printf 'vm.swappiness=20\nvm.vfs_cache_pressure=100\n' | \
  sudo tee /etc/sysctl.d/99-verilio-memory.conf
sudo sysctl --system
free -h
```

If `fallocate` is unavailable, create the same file with `dd`. Do not configure hibernation around
this swap file. Compose deliberately avoids aggressive memory limits; PostgreSQL is instead
configured with 128 MB shared buffers, 4 MB work memory, 64 MB maintenance memory, and 20 maximum
connections.

Production services use Docker's bounded `local` logging driver: five files of at most 20 MB per
service. Check `df -h`, `docker system df`, backup age, and volume growth weekly. Never use an
unreviewed cleanup command that deletes Docker volumes.

## 4. Runtime configuration and secrets

Copy `deploy/verilio.env.example` to `/etc/verilio/verilio.env`. Set a release version and generate
one stable owner UUID:

```sh
sudo install -d -m 0700 /etc/verilio/secrets /srv/verilio/backups
uuidgen
```

`LOCAL_USER_ID` is not a password, but it is recovery-critical. Do not casually change it after
data exists. A restored database must run with the same value or its owner-scoped records will
appear inaccessible.

Create independent hexadecimal passwords so the database URL needs no URL escaping:

```sh
umask 077
openssl rand -hex 32 | sudo tee /etc/verilio/secrets/postgres_admin_password >/dev/null
openssl rand -hex 32 | sudo tee /etc/verilio/secrets/postgres_app_password >/dev/null
sudo chmod 0444 /etc/verilio/secrets/*
```

Use the application password to create `/etc/verilio/secrets/database_url` with no trailing
comment:

```text
postgresql://verilio_app:APPLICATION_PASSWORD@postgres:5432/verilio
```

Then run `sudo chmod 0444 /etc/verilio/secrets/database_url`. Standalone Docker Compose implements
file-backed secrets as read-only bind mounts and does not reliably remap their ownership for
non-root containers. The files therefore need read permission inside the containers. They remain
protected on the host because `/etc/verilio/secrets` is root-owned mode `0700`, so non-root host
users cannot traverse the directory. Do not loosen the directory permission.

The production API gives `DATABASE_URL_FILE` precedence over `DATABASE_URL`. Development may keep
using `DATABASE_URL`. Startup fails with a redacted configuration error if the selected value is
missing, unreadable, empty, or invalid. Secret values must never enter the release archive.

Back up `/etc/verilio/verilio.env` and the three secret files to the encrypted recovery store.
Restrict that recovery copy as carefully as the database backup.

## 5. Build and test on OrbStack

Check out a clean release commit and create an explicit tag. Do not use `latest` and do not reuse
an existing release tag for different source:

```sh
git checkout <release-commit>
git tag <version>
./deploy/build-release.sh <version>
./deploy/test-release.sh <version>
./deploy/export-release.sh <version>
```

`build-release.sh` builds `linux/amd64` images with the frozen pnpm lockfile. The API runtime is
non-root, contains compiled code and migrations, and has no TypeScript compiler or test runner.
The Caddy runtime is also non-root and contains the built SPA.

`test-release.sh` creates isolated secrets, networks, ports, and database volumes. It verifies:

- production Compose validity and ordered startup;
- PostgreSQL data checksums;
- no API or database host exposure;
- loopback-only Caddy exposure;
- all migrations and API readiness;
- SPA root, deep route, and health proxying;
- the canonical MVP workflow in Chromium through Caddy;
- data persistence after container restart;
- a custom-format database backup;
- restoration into a second disposable volume;
- restored Settings, hierarchy, Time, Reports, Invoice history, source traceability, and PDF.

The script removes both disposable stacks and volumes. It does not need a Tailscale account.

For local validation of uncommitted deployment work only, `VERILIO_ALLOW_UNRELEASED_BUILD=true`
may bypass the clean-tag requirement. Never use that override for an actual alpha release.

## 6. Release artifact and transfer

`export-release.sh` creates:

```text
release/
├── verilio-<version>-release.tar.gz
├── verilio-<version>-release.tar.gz.sha256
└── verilio-<version>/
    ├── verilio-<version>-images.tar.gz
    ├── compose.prod.yml
    ├── checksums.txt
    ├── DEPLOYMENT.md
    ├── release-manifest.txt
    └── deploy/
        ├── backup.sh
        ├── restore-drill.sh
        ├── server-deploy.sh
        ├── smoke-test.sh
        ├── verify-data.sh
        ├── verilio.env.example
        └── postgres/init-app-role.sh
```

The image archive contains the versioned API and gateway images plus the pinned PostgreSQL image.
The NC110 therefore needs no registry, source checkout, Node.js, pnpm, Vite, or image build.

Transfer the outer archive and checksum using `scp`, `rsync`, removable media, or another trusted
private channel. On the NC110:

```sh
cd /opt/verilio/releases
sha256sum --check verilio-<version>-release.tar.gz.sha256
tar -xzf verilio-<version>-release.tar.gz
```

## 7. Initial deployment and updates

Set `VERILIO_VERSION` in `/etc/verilio/verilio.env` to the exact transferred tag. From the extracted
release:

```sh
sudo VERILIO_ENV_FILE=/etc/verilio/verilio.env ./deploy/server-deploy.sh
sudo ln -sfn /opt/verilio/releases/verilio-<version> /opt/verilio/current
```

The deployment script verifies every release checksum, loads the image archive with `docker load`,
creates a pre-deployment backup when an existing PostgreSQL service is running, applies migrations,
waits for readiness, and checks the loopback gateway. On first deployment there is no pre-existing
database to back up.

For an update:

1. Verify the latest daily and off-host backup.
2. Transfer and verify the new release.
3. Set the explicit new `VERILIO_VERSION`.
4. Run `server-deploy.sh` from the new release.
5. Verify the UI, current Timer state, Reports, an Invoice, and PDF generation.
6. Move `/opt/verilio/current` only after acceptance.
7. Retain the previous release and pre-deployment backup through the rollback window.

Use a short maintenance window for migrations. Do not run source builds on the NC110.

## 8. Tailscale Serve

Install Tailscale on Ubuntu using its official instructions, then interactively join the intended
tailnet. Do not commit or script a reusable auth key.

With the Caddy gateway healthy on loopback:

```sh
curl -f http://127.0.0.1:8080/health/ready
sudo tailscale serve --bg --https=443 http://127.0.0.1:8080
tailscale serve status
```

Open the reported private HTTPS URL from another authorized tailnet device. Verify the SPA, a deep
route, and `/health/ready`. Review tailnet ACLs so only intended personal devices can connect. Do
not enable Funnel. The host firewall must not open the loopback gateway, API, or PostgreSQL to WAN.

## 9. Health and logs

```sh
curl -f http://127.0.0.1:8080/health/live
curl -f http://127.0.0.1:8080/health/ready
docker compose --env-file /etc/verilio/verilio.env \
  -f /opt/verilio/current/compose.prod.yml ps
docker compose --env-file /etc/verilio/verilio.env \
  -f /opt/verilio/current/compose.prod.yml logs --tail 200 api gateway postgres
```

Fastify and Caddy emit structured JSON with request IDs. PostgreSQL emits operational logs. Request
bodies, database URLs, secret contents, and full Client/Invoice payloads are not logged by default.
An external tailnet device may poll `/health/ready`; a large monitoring stack is unnecessary.

## 10. Backups and off-host copies

Alpha policy:

- one daily logical backup;
- one mandatory backup before every deployment;
- approximately seven days retained locally;
- encrypted off-host copy after each successful backup.

Run:

```sh
sudo VERILIO_ENV_FILE=/etc/verilio/verilio.env \
  /opt/verilio/current/deploy/backup.sh
```

Each mode-0700 backup directory contains mode-0600 `database.dump`, `globals.sql`, `checksums.txt`,
and manifest files. The manifest records timestamp, backup kind, PostgreSQL version, Verilio
version, migration count, dump filename, and checksum. The globals dump is recovery metadata and
may contain password hashes; it must be encrypted off-host and handled as sensitive. The manifest
contains no credential.

Schedule that exact command once daily with a root-owned systemd timer or cron entry; `backup.sh`
loads the version, backup directory, retention, and Compose project from the protected environment
file. After every successful run, copy the completed directory to encrypted removable storage, an
SSH target, restic/rclone storage, or another provider-neutral destination. Cloudflare R2 is one
optional inexpensive S3-compatible destination, not a requirement. Keep off-host credentials in
root-owned secret configuration, never the manifest. Alert if the newest completed off-host backup
is more than 26 hours old.

The stricter future policy is every six hours, approximately six-hour RPO. Enable it by changing
the timer frequency; the backup format and scripts remain the same.

## 11. Restore drill

Run at least monthly and before relying on a new backup destination:

```sh
sudo VERILIO_ENV_FILE=/etc/verilio/verilio.env \
  /opt/verilio/current/deploy/restore-drill.sh \
  /srv/verilio/backups/<backup-directory>
```

The drill verifies checksums, creates unique disposable secrets and a fresh Docker volume, restores
the dump, runs `ANALYZE` and newer migrations, starts the application, checks health, and verifies
restored domain/Invoice/PDF coherence. Its cleanup trap removes only the named disposable stack and
volume. It never points at `verilio_pgdata`.

## 12. Production restore

Do not overwrite the failed production volume.

1. Stop `gateway` and `api` to prevent writes.
2. Record the current release, `LOCAL_USER_ID`, volume, and failure symptoms.
3. Preserve the failed volume unchanged for investigation; do not reuse it as the restore target.
4. Verify the selected backup with `sha256sum --check`.
5. Configure a new uniquely named production volume in `VERILIO_PGDATA_VOLUME`.
6. Start only PostgreSQL so the bootstrap role/database are created from current secrets.
7. Restore `database.dump` into empty `verilio` as `verilio_app` with
   `pg_restore --no-owner --no-acl --exit-on-error`.
8. Run `ANALYZE` as `verilio_admin`.
9. Run the migration service if the backup predates the application image.
10. Start API and gateway and run the smoke test.
11. Verify Settings, Clients, Projects, Tasks, Time, Reports, Invoices, bidirectional source
    traceability, and a PDF.
12. Keep the failed volume until recovery is accepted.

Current role names are recreated from deployment secrets. `globals.sql` is retained for audit and
exceptional recovery; do not blindly execute it over an initialized cluster.

## 13. Rollback

Every future release must classify its database change.

**Compatible/additive migration:** set `VERILIO_VERSION` to the previous loaded image tag, start the
previous release, keep the forward migration, and run health/application smoke checks.

**Incompatible or data-changing migration:** stop the application, preserve the upgraded volume,
create a fresh volume, restore the pre-deployment backup, load/select the previous images, and run
health/data checks.

Never automate destructive down migrations. Voided Invoice history, numbering, Timer state,
historical rates/currencies, and Invoice/Time relationships are restored together from PostgreSQL.

## 14. Total host loss

The encrypted off-host recovery set must contain:

- the latest verified database backup;
- `/etc/verilio/verilio.env` and the stable `LOCAL_USER_ID`;
- the three secret files;
- the current and previous release archives/checksums;
- this runbook.

On a replacement Ubuntu host, install Docker Compose and the private-network option, recreate the
directory permissions, restore configuration, load the recorded images, create a fresh volume,
restore the verified database, and run health/application checks before directing devices to the
new Tailscale node.

This alpha provides backup-based recovery, not automatic failover. PostgreSQL replication,
WAL/PITR, Kubernetes, Redis, queues, and public authentication remain outside D1.
