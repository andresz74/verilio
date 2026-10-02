# Verilio Private Alpha Self-Hosted Deployment

## 1. Scope and safety boundary

This runbook deploys the fixed-local-owner Verilio MVP to a private Samsung NC110 running
Ubuntu Server 24.04.3 LTS. Official tagged releases are built and tested off-host on the
development computer through OrbStack. The NC110 can additionally build commit-addressed
`main-<sha>` snapshots for private-alpha dogfooding (section 15); snapshots are not official releases.

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

- release-provenance agreement and fail-before-mutation behavior;
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

For local deployment-tool validation and the explicit snapshot workflow in section 15,
`VERILIO_ALLOW_UNRELEASED_BUILD=true` may bypass the clean-tag requirement. Never use that override
for an official tagged alpha release. Official builds still require a clean tree and a matching tag.

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
        ├── verify-release-provenance.sh
        ├── verify-data.sh
        ├── verilio.env.example
        └── postgres/init-app-role.sh
```

The image archive contains the versioned API and gateway images plus the pinned PostgreSQL image.
For this official-release path, the NC110 needs no registry, source checkout, Node.js, pnpm, Vite,
or image build. The optional snapshot path needs Git and Docker buildx, not a host Node/pnpm toolchain.

Transfer the outer archive and checksum using `scp`, `rsync`, removable media, or another trusted
private channel. On the NC110:

```sh
cd /opt/verilio/releases
sha256sum --check verilio-<version>-release.tar.gz.sha256
tar -xzf verilio-<version>-release.tar.gz
```

## 7. Initial deployment and updates

Replace `<version>` with the exact transferred tag. After verifying the extracted release, switch
`current`, synchronize `VERILIO_VERSION`, and verify it before deployment:

```sh
VERSION='<version>'
sudo ln -sfn "/opt/verilio/releases/verilio-$VERSION" /opt/verilio/current
sudo sed -i "s/^VERILIO_VERSION=.*/VERILIO_VERSION=$VERSION/" /etc/verilio/verilio.env
sudo grep '^VERILIO_VERSION=' /etc/verilio/verilio.env
sudo VERILIO_ENV_FILE=/etc/verilio/verilio.env /opt/verilio/current/deploy/server-deploy.sh
```

`server-deploy.sh` uses `VERILIO_VERSION` to select both the image archive and image tags.
Switching `/opt/verilio/current` alone does not update the env file; its version must match the
release being deployed. The script does not rewrite a mismatched value automatically.

Before loading images or touching the running stack, `verify-release-provenance.sh` checks that the
physical `verilio-<version>` directory, `VERILIO_VERSION`, release manifest, archive filename,
archive image tags, pinned PostgreSQL image, and all release checksums agree. After `docker load`,
it also compares the loaded image IDs with the checksummed manifest before backup,
maintenance, or migration. A mismatch exits with a diagnostic while the running application stays
untouched; loading an unused target image is the only possible side effect of a post-load image-ID
failure.

After preflight, the deployment script inspects the existing API and gateway image tags. It fails
before maintenance if recognizable Verilio source versions disagree, creates a pre-deployment
backup when PostgreSQL is already running, applies migrations, waits for readiness, and checks the
loopback gateway. On first deployment there is no pre-existing database to back up.

For an update:

1. Verify the latest daily and off-host backup.
2. Transfer and verify the new release.
3. Switch `/opt/verilio/current` to the new release.
4. Update `/etc/verilio/verilio.env` to the matching `VERILIO_VERSION` and verify it.
5. Run `server-deploy.sh` from `/opt/verilio/current`.
6. Verify the UI, current Timer state, Reports, an Invoice, and PDF generation.
7. Retain the previous release and pre-deployment backup through the rollback window.

Use a short maintenance window for migrations. Official release builds remain off-host; only the
explicit snapshot workflow below builds source on the NC110.

If deployment reports a missing archive for a previous release, compare:

```sh
readlink -f /opt/verilio/current
grep '^VERILIO_VERSION=' /etc/verilio/verilio.env
cat /opt/verilio/current/release-manifest.txt
```

The symlink, env value, and manifest must identify the same release version.

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
and manifest files. The manifest records timestamp, backup kind, PostgreSQL version, migration
count, dump filename, checksum, and explicit source/target release provenance. A daily backup uses
the active `VERILIO_VERSION` as `source_verilio_version` and leaves `target_verilio_version` empty.
A pre-deployment backup records the inspected running source version and the selected deployment
target separately; its directory name also identifies the source-to-target transition. The retained
`verilio_version` manifest field is a backward-compatible alias for the source/database version,
not the incoming target. The globals dump is recovery metadata and may contain password hashes; it
must be encrypted off-host and handled as sensitive. The manifest contains no credential.
Predeploy backups do not expire any existing backups. Daily-backup runs retain their existing
daily-retention policy. `server-deploy.sh` prints the completed predeploy backup path.

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

**Compatible/additive migration:** point `/opt/verilio/current` back to the previous release, set
`VERILIO_VERSION` to that exact release, and invoke that release's `server-deploy.sh`. Rollback uses
the same directory/env/manifest/archive preflight as a forward deployment; it proceeds only when
the selected previous release is internally coherent. Keep the forward migration and run
health/application smoke checks.

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

## 15. One-command main snapshots (private dogfooding only)

**Snapshot ≠ official release.** A snapshot uses `main-<first 12 hexadecimal commit characters>`
(for example `main-11187285dedb`) with the full fetched SHA in `release-manifest.txt`. It creates no
Git tag or GitHub Release. There are no mutable `latest` tags. The wrapper uses the existing
build/export/provenance/server-deploy scripts; production Compose and the immutable artifact format
are unchanged. It does not run the full source/Chromium/release gate on this small host.

### One-time source and deployment-user setup

Use a trusted **non-root** deployment account with local Docker access and sudo privileges. Docker
group membership is root-equivalent. Install Git and Docker's buildx and Compose plugins through
the established Ubuntu/Docker installation process. No Node, pnpm, browser, or new service is needed.
Set up read access to the GitHub repository using the account's usual SSH/HTTPS credentials; do not
put tokens in the Git remote URL. The wrapper accepts the canonical `andresz74/verilio` HTTPS or SSH
origin and does not manage authentication.

After the initial production installation (sections 3–7), as that deployment user:

```sh
sudo install -d -o "$(id -un)" -g "$(id -gn)" /srv/verilio/source
git clone https://github.com/andresz74/verilio.git /srv/verilio/source
# The sibling scratch directory must be writable without making Git/builds root-owned.
sudo install -d -o "$(id -un)" -g "$(id -gn)" /srv/verilio/snapshot-work
docker info
docker buildx version
docker compose version
```

For a non-writable `/srv/verilio` parent, set this once in the deployment user's shell profile:

```sh
export VERILIO_SNAPSHOT_WORK_ROOT=/srv/verilio/snapshot-work
```

Default paths are `/opt/verilio/releases`, `/opt/verilio/current`, and `/etc/verilio/verilio.env`.
An existing coherent current release and env are required, so there is always a recorded rollback
target. `VERILIO_RELEASE_ROOT`, `VERILIO_CURRENT_LINK`, and `VERILIO_ENV_FILE` are supported for isolated
fixtures/alternate private installations; do not casually change them on production. The release
root must be an absolute physical directory. Use only the local Unix-socket Docker daemon, not
`DOCKER_HOST` or a remote context.

### Routine deployment

Verify the latest daily/off-host recovery point as usual. Then run **without sudo**:

```sh
cd /srv/verilio/source
./deploy/nc110-deploy-main.sh
```

The script refuses a dirty checkout (including untracked files), fetches only `origin/main`, resolves
its exact full commit, and builds in a temporary detached worktree. It never switches/resets the
source checkout or any local branch. A clean checkout of another branch is allowed: it still deploys
**fetched main**, not that branch. Keep the source checkout's wrapper current using an explicit
`git pull --ff-only` on main when deployment tooling changes; the wrapper does not rewrite itself.

Flow:

1. Validate tools, current selection/configuration, local Docker, and resources; acquire an exclusive
   snapshot-operation directory lock in the release store.
2. Fetch/resolve main; derive `main-<12-hex>`; create an invocation-specific scratch directory.
3. Build the exact detached commit with the snapshot-only `VERILIO_ALLOW_UNRELEASED_BUILD=true` override
   and `linux/amd64`; use the existing pinned `postgres:17.9-alpine`.
4. Export the existing complete release format, verify the outer checksum, full source commit, and
   existing pre-load provenance. Copy into a root-owned staging directory in the release store;
   verify again, then move to the final immutable directory without overwriting.
5. Run target provenance with a temporary env copy changing only `VERILIO_VERSION`. Refuse if the
   original env/current selection changed during the build. Atomically replace each env/symlink
   separately, preserving env owner/mode and all other config bytes, including the gateway port.
6. Invoke the selected release's `server-deploy.sh` with the production env. It still owns source
   inspection, image load/ID checks, predeploy backup, maintenance, migrations, readiness, and smoke.

No secrets are read by the wrapper, no Tailscale/network changes occur, and no images/releases/backups
are pruned. Only invocation-owned temporary staging/env/worktree files are cleaned up. An interrupted
process may leave a `.snapshot-deploy.lock` or `.snapshot-install.*` directory; inspect the process
and contents before an operator removes a stale lock/staging directory. These are not accepted
releases. A dirty temporary worktree is retained instead of force-deleted. Do not run a manual/tagged
deployment concurrently; the lock serializes snapshot commands, not other operator commands.

### Resource headroom

Builds contend with the running app on a 2 GB machine and can be slow. Keep the recommended 4 GB swap.
The preflight shows `free -h` and requires **3 GiB combined available RAM + free swap**, plus **12 GiB
free** on each filesystem holding scratch, releases, and the Docker data root. These are conservative
minimum starting headroom for build layers, two compressed archive copies, and installation staging,
not resource reservations or a guarantee against OOM/disk exhaustion. Shared filesystems do not
gain separate budgets. Leave more space for a growing database/backups and use off-host official
builds if the machine is busy. No automatic space recovery occurs.

### Same-commit reruns and failures

- A complete existing release is reused only after checksum/provenance and **full SHA** validation.
  Even a 12-character prefix collision with another full SHA is rejected. A corrupt, incomplete,
  symlinked, or mismatched final release is never overwritten.
- Existing API/gateway tags require matching version/revision/platform labels. With an accepted
  release they must also match its image IDs; absent tags can be restored by normal `docker load`.
  Before export, a complete matching image pair can be reused. A partial pair from an interrupted
  build is refused for operator inspection; the wrapper never silently overwrites one tag.
- Each build/export uses fresh isolated staging, never a prior failed output as an accepted artifact.
  Reuse still invokes server-deploy (and therefore its normal backup/maintenance/health steps).
- Before selection, failures leave the current release/env and running containers unchanged. A
  failed build may leave unused images/cache, and a verified installed release may remain for reuse.
- After selection starts, failures show the phase/exit status, previous/target releases, and explicit
  compatible rollback commands. Env/symlink replacement is not one cross-file transaction; interruption
  between them is reported, not disguised as success. No automatic runtime rollback is attempted.

Successful output includes full SHA, snapshot/previous version, current path, images, predeploy backup,
configured gateway port, live/ready/smoke results, and rollback target. Backups retain source/target
provenance exactly as for tagged deployments.

### Inspect and roll back

```sh
sudo grep '^VERILIO_VERSION=' /etc/verilio/verilio.env
readlink -f /opt/verilio/current
sudo grep -E '^(verilio_version|source_commit)=' /opt/verilio/current/release-manifest.txt
```

For a **schema-compatible** rollback to an existing immutable release:

```sh
PREVIOUS='<previous-version>'
sudo ln -sfn "/opt/verilio/releases/verilio-$PREVIOUS" /opt/verilio/current
sudo sed -i "s/^VERILIO_VERSION=.*/VERILIO_VERSION=$PREVIOUS/" /etc/verilio/verilio.env
sudo VERILIO_ENV_FILE=/etc/verilio/verilio.env /opt/verilio/current/deploy/server-deploy.sh
```

Keep `VERILIO_GATEWAY_PORT` and every other setting unchanged. Use the configured gateway port for
health checks; do not assume the default 8080 is unused by other services. Follow section 13's
restore-based procedure for incompatible/data-changing migrations. No down-migration automation exists.

### Promote a dogfooded commit

Record the manifest's full `source_commit`. On the development machine, check out that exact clean
commit, run the complete source gate and disposable production release gate, and create a new unused
explicit alpha tag following the established release process. Build/export again using that tag
**without the unreleased override**; do not retag snapshot images or modify snapshot artifacts.
Keep the snapshot and prior release available through the rollback window.

Validate tooling changes off-host with `pnpm test:deploy` (provenance plus snapshot fixtures). The
snapshot tests use temporary Git repositories and stub host/Docker operations, never nc110. They also
run as part of `test-release.sh`; that full release gate still runs on the development machine.
