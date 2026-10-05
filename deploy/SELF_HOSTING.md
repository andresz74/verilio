# Verilio Prebuilt Self-Host Guide

## Scope and prerequisites

Use this guide from the generated `verilio-<version>-self-host/` package. Its `compose.yml`
is a copy of Verilio's one canonical production runtime. The package contains environment
examples, this guide, PostgreSQL bootstrap and smoke helpers; it contains no images or secrets.
It is not the checksummed image-archive bundle and must not be passed to `server-deploy.sh`.

The initial validated path is a **private `linux/amd64` host**. D05 passed on an isolated Ubuntu
24.04.5 LTS host with Docker Engine 29.1.3 and Compose 2.40.3, using `v0.1.1-alpha.5`, anonymous
pulls and exact published digests. Startup, migrations, health, smoke and persistence after
recreation passed. Other distributions/architectures and cross-version upgrades are not claimed
as tested. CasaOS, Portainer and Proxmox compatibility remain unclaimed.

Install Docker Engine and the system-wide Docker Compose plugin using your host's supported
instructions. The deployment account must have Docker access (which is effectively root access).
Also provide Bash, curl, OpenSSL, `uuidgen` (Ubuntu: `uuid-runtime`), and standard Linux utilities
including tar, awk, sed and sha256sum. Commands below run in Bash as that deployment account.
The runtime host needs **no source checkout, Git, Node, npm/pnpm, Vite, TypeScript or buildx**.
Allow disk/RAM headroom for images, PostgreSQL, backups and updates; no universal hardware
minimum has been established. Check `free -h`, `df -h` and `docker system df` regularly.

## Private-network security boundary

This is fixed-owner private mode: use LAN, VPN, tailnet or another trusted private ingress.
Gateway is bound to host loopback only, normally `127.0.0.1:8080`; API and PostgreSQL publish no
host ports. A remote browser needs a separately configured trusted private proxy/tunnel to that
loopback endpoint. Do not open router/WAN ports or change the binding for public access.
**Direct public Internet exposure is unsupported.** Authentication, secure sessions and public
server-side authorization are future work. The browser never chooses the owner.

## Acquire the package on a trusted preparation machine

There is currently **no downloadable GitHub Release self-host bundle**. A trusted preparer with
Git and Bash exports the package from an exact release-tag checkout; this needs no image build
or Node/pnpm. Use a dedicated clean checkout of `https://github.com/andresz74/verilio`, and select
an existing officially published version. The first validated example is `v0.1.1-alpha.5`.
Do not create/move tags or treat private `main-<sha>` snapshots as official registry releases.

Historical alpha.5 predates this expanded guide. Preserve a reviewed D06-or-later copy of this
file before checking out that older tag, then replace **only the exported documentation**.
For newer tags already containing this guide, the exporter includes it directly. This does
not change the tagged Compose/runtime support files or published images.

On the preparation machine, starting in the clean checkout containing the reviewed guide:

```bash
set -euo pipefail
version=v0.1.1-alpha.5                  # exact existing published release tag
output_dir="$HOME/verilio-packages"     # choose a trusted output directory
mkdir -p "$output_dir"
cp deploy/SELF_HOSTING.md "$output_dir/SELF_HOSTING.reviewed.md"
git fetch origin tag "$version"
git checkout --detach "refs/tags/$version"
test -z "$(git status --porcelain)"
test "$(git rev-parse HEAD)" = "$(git rev-parse "refs/tags/$version^{commit}")"
./deploy/export-self-host-package.sh \
  "$version" \
  ghcr.io/andresz74/verilio-api \
  ghcr.io/andresz74/verilio-gateway \
  "$output_dir"
cp "$output_dir/SELF_HOSTING.reviewed.md" \
  "$output_dir/verilio-$version-self-host/SELF_HOSTING.md"
```

The exporter refuses an existing target package. Transfer **only** `verilio-<version>-self-host/`
to a durable directory on the runtime host through a trusted channel. Preserve script executable
bits and compare transferred files/checksums with the preparer's copy. Do not transfer source,
node_modules, build outputs, local Docker images or registry credentials.

## Configure a fresh installation

Work from the directory containing the transferred `compose.yml`. Each new Bash session needs
this helper; it always uses this package's runtime and env file:

```bash
set -euo pipefail
cd "$HOME/verilio-v0.1.1-alpha.5-self-host"  # replace with your durable package directory
# Shell values override verilio.env; remove conflicting overrides deliberately.
unset COMPOSE_PROJECT_NAME VERILIO_VERSION VERILIO_API_IMAGE VERILIO_GATEWAY_IMAGE
unset LOCAL_USER_ID LOG_LEVEL VERILIO_GATEWAY_PORT VERILIO_PGDATA_VOLUME
unset VERILIO_DATABASE_URL_SECRET VERILIO_POSTGRES_ADMIN_PASSWORD_SECRET
unset VERILIO_POSTGRES_APP_PASSWORD_SECRET
dc() { docker compose --env-file verilio.env -f compose.yml "$@"; }
docker context show
docker info --format '{{.Name}} {{.DockerRootDir}}'
```

Confirm Docker points to the intended private host before any operation. Run the next block
**once, only for a fresh install**, not for updates/restores:

```bash
test ! -e verilio.env
test ! -e secrets
umask 077
cp verilio.env.example verilio.env
owner_uuid=$(uuidgen | tr '[:upper:]' '[:lower:]')
sed -i "s/^LOCAL_USER_ID=.*/LOCAL_USER_ID=$owner_uuid/" verilio.env
chmod 0600 verilio.env
mkdir -m 0700 secrets
openssl rand -hex 32 > secrets/postgres_admin_password
openssl rand -hex 32 > secrets/postgres_app_password
app_password=$(cat secrets/postgres_app_password)
printf 'postgresql://verilio_app:%s@postgres:5432/verilio\n' "$app_password" \
  > secrets/database_url
unset app_password
chmod 0444 secrets/postgres_admin_password secrets/postgres_app_password secrets/database_url
```

The admin/app passwords are independent. Hex passwords require no URL escaping. Do not use shell
tracing, print secret files, paste passwords into command arguments or commit these files.
Standalone Compose mounts secrets as files and does not reliably remap ownership for non-root
containers. Mode `0444` permits container reads; the deployment-account-owned directory must
remain `0700` so other host accounts cannot traverse it.

Review `verilio.env` locally. For the validated example retain:

```env
COMPOSE_PROJECT_NAME=verilio
VERILIO_VERSION=v0.1.1-alpha.5
VERILIO_API_IMAGE=ghcr.io/andresz74/verilio-api
VERILIO_GATEWAY_IMAGE=ghcr.io/andresz74/verilio-gateway
VERILIO_GATEWAY_PORT=8080
VERILIO_PGDATA_VOLUME=verilio_pgdata
VERILIO_DATABASE_URL_SECRET=./secrets/database_url
VERILIO_POSTGRES_ADMIN_PASSWORD_SECRET=./secrets/postgres_admin_password
VERILIO_POSTGRES_APP_PASSWORD_SECRET=./secrets/postgres_app_password
```

Keep the generated UUID in `LOCAL_USER_ID`, and `LOG_LEVEL=info`. Review project name, unused
host port and volume name before first startup. An existing volume with the selected name might
contain another installation's data; inspect it and choose a fresh name if necessary, never delete
an unfamiliar volume. Keep repository-only image values separate from the explicit immutable tag;
do not select floating tags/aliases.

**Preserve `LOCAL_USER_ID`, project name, volume name, secrets and private ingress across updates
and restores.** Changing the owner makes existing owner-scoped data appear inaccessible; it does
not migrate ownership. Changing the volume name selects different database storage. Changing a
password file does not rotate an existing PostgreSQL role automatically.

Relative secret paths and the init bind mount resolve against the directory containing
`compose.yml`. From elsewhere, pass absolute `--env-file` and `-f` paths; `--env-file` itself
resolves from the caller's directory. Never source the env file just to read a setting.

## Validate, pull anonymously and start

```bash
dc config --quiet
dc config --images
# Empty CLI credentials prove anonymous access; use the system-wide Compose plugin.
(
  export DOCKER_CONFIG
  DOCKER_CONFIG=$(mktemp -d)
  printf '{}\n' > "$DOCKER_CONFIG/config.json"
  dc pull
)
version=$(awk -F= '$1 == "VERILIO_VERSION" {print $2}' verilio.env)
docker image inspect "ghcr.io/andresz74/verilio-api:$version" \
  "ghcr.io/andresz74/verilio-gateway:$version" \
  --format '{{json .RepoDigests}} {{.Os}}/{{.Architecture}}'
```

Config must show API/migrate at the selected API ref, Gateway at the selected Gateway ref,
`postgres:17.9-alpine`, and no build entries. No GHCR login, PAT or token is needed. Inspect
RepoDigests against the release's publication record, not tags alone. Alpha.5 expected digests:

```text
API: sha256:9d76436b4dd86cbca0b8a53cfe42be7554878b7e98d69298cee568364e1450e6
Gateway: sha256:dcb455a392453ac5e6514bb6a1047095df49612263e25cbe9724494ef21fceb8
Source: db222d2446a1f12b5e29059665a6db7f2b4d1783
Platform: linux/amd64
```

Stop on any mismatch. The archive manifest/provenance flow is separate; generic registry-backed
package provenance remains an unresolved distribution question. This manual identity check does
not introduce or replace a provenance manifest.

```bash
dc up -d --wait --wait-timeout 180
dc ps -a
port=$(awk -F= '$1 == "VERILIO_GATEWAY_PORT" {print $2}' verilio.env)
./deploy/smoke-test.sh "http://127.0.0.1:$port"
curl --fail --silent --show-error "http://127.0.0.1:$port/health/ready"
```

Expected order: **PostgreSQL healthy → migrate exits 0 → API healthy → Gateway healthy**.
The smoke helper checks SPA root, `/reports/summary`, `/health/live`, `/health/ready` and database
connected. Only Gateway should have a published host port, bound to `127.0.0.1`.

## First use, health and logs

Open the loopback URL locally or through your trusted private ingress. No seed data is needed:
**Settings → Business → Client → Project → optional Tasks → Timer**.

```bash
dc ps -a
dc logs --tail 200 postgres migrate api gateway
./deploy/smoke-test.sh "http://127.0.0.1:$port"
```

After restarts/updates check actual Business Settings and other known data, not health alone.
Review logs locally and redact sensitive information before sharing; do not share env/secrets
or credential-bearing database URLs. Bounded container logging does not replace database backups.

## Logical backup and recovery configuration

Back up **before every version update**, and on a regular schedule appropriate to your data-loss
tolerance. PostgreSQL in the configured named volume is authoritative. This logical dump reads
that running service; it does not copy a live database directory. Stop writes (`dc stop gateway api`)
when you need the exact pre-update recovery point; leave PostgreSQL running for the dump.

From the active package directory with `dc` defined:

```bash
set -euo pipefail
umask 077
backup_root="$HOME/verilio-backups"      # durable location outside the release package
mkdir -p "$backup_root"
chmod 0700 "$backup_root"
backup_dir="$backup_root/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 0700 "$backup_dir"              # refuses an existing backup directory
dc exec -T postgres pg_dump --username verilio_admin --dbname verilio \
  --format=custom --no-owner --no-acl > "$backup_dir/database.dump"
test -s "$backup_dir/database.dump"
dc exec -T postgres pg_restore --list < "$backup_dir/database.dump" \
  > "$backup_dir/restore-list.txt"
tar -czf "$backup_dir/recovery-config.tar.gz" verilio.env secrets
chmod 0600 "$backup_dir"/*
(
  cd "$backup_dir"
  sha256sum database.dump recovery-config.tar.gz > SHA256SUMS
  sha256sum --check SHA256SUMS
)
printf 'Backup completed: %s\n' "$backup_dir"
```

The PostgreSQL commands use its existing local container connection; passwords are neither
printed nor passed as CLI arguments. A failed command, empty dump or checksum failure means the
backup is **not accepted**. Archive-list readability/checksums alone do not prove restorability.
The configuration archive contains credentials: keep it protected and encrypt it for any
transfer/storage outside this account. Preserve env/secrets separately from the database dump,
and retain the matching previous package/version and image identity.

Copy the accepted dump, checksums and recovery configuration to an **encrypted off-host recovery
store**, using your chosen storage/transport. Verify checksums there. Never rely only on the same
host/disk. Test the restore procedure below on a disposable private recovery target before relying
on a backup, and regularly afterward. Do not overwrite the active volume during a drill.

## Update to a different official release

D05 validated alpha.5 recreation/persistence, **not a cross-version official upgrade**. There is
currently only one successfully published registry release. The procedure below is guidance for
a future target release; its release notes/schema compatibility and real upgrade qualification
must be reviewed before execution.

1. Read target release notes, supported platform and migration/rollback classification. Verify a
   usable pre-update backup and tested restore. Retain the current package and images.
2. Obtain the **target release's generated package/runtime definition** through the acquisition
   procedure. Do not assume an old `compose.yml` is forever compatible.
3. Stop old Gateway/API writes with `dc stop gateway api`; take and verify the final pre-update
   backup above. From the old package, `dc down` then stops/removes containers/networks while
   preserving the named database volume. This is a maintenance window.
4. In the target package copy its `verilio.env.example` to `verilio.env`. Carry forward reviewed
   settings: same `LOCAL_USER_ID`, Compose project, PostgreSQL volume, Gateway port and private
   ingress. Keep the target's explicit `VERILIO_VERSION`, repository refs and reviewed runtime
   changes. Do not blindly replace the target env example with the old one.
5. Copy the existing three secret files into the target package's `secrets/` directory, keeping
   the directory `0700` and files `0444`. Use the **same credentials**; never regenerate them as
   an update step. Review secret paths against the target package. Protect `verilio.env` as `0600`.
6. Work from the target directory, clear conflicting shell overrides and define `dc` there as
   above. Validate, anonymously pull the exact target refs, and verify expected digests/platform.
7. Start with `dc up -d --wait --wait-timeout 180`; check `dc ps -a`, migrate exit 0, health/smoke
   and known user data. Confirm the same owner UUID, volume and private-only exposure.

Do not delete volumes in normal updates. If any step fails, stop and inspect logs; preserve the
volume and pre-update backup. Do not repeatedly retry failed/data-changing migrations or assume
selecting a previous tag is automatically safe. Keep the prior recovery set through acceptance.

## Schema-aware rollback and restore

### Compatible/additive schema

Only if release notes explicitly establish backward compatibility, stop/remove the new stack
with its `dc down` (preserving storage), select the previous **package/runtime** and explicit
version with unchanged owner, volume and secrets, then validate/start/smoke and verify data.
An alpha rollback is not universally safe. No destructive down migrations are automated.

### Incompatible/data-changing schema or restore drill

Stop writes in the affected stack and preserve its upgraded volume unchanged. Use the matching
previous compatible release package on a **new, isolated recovery target**; never restore over
user data. Obtain the verified pre-update backup and protected configuration archive there.
Before starting any service, restore/review the stable owner and credentials, but choose a **new
unused** `VERILIO_PGDATA_VOLUME` and a distinct `COMPOSE_PROJECT_NAME`. On a same-host drill,
choose a different loopback Gateway port as well. Check `docker volume inspect NEW_VOLUME_NAME`:
if it exists, stop and select a fresh name; do not reuse an unfamiliar volume.

In the fresh recovery package, extract only the protected configuration from your trusted
accepted backup. Do not overwrite existing recovery configuration. Review it locally before
starting services:

```bash
set -euo pipefail
backup_dir=/absolute/path/to/accepted-backup
(cd "$backup_dir" && sha256sum --check SHA256SUMS)
test ! -e verilio.env
test ! -e secrets
tar -xzf "$backup_dir/recovery-config.tar.gz" verilio.env secrets
chmod 0600 verilio.env
chmod 0700 secrets
chmod 0444 secrets/postgres_admin_password secrets/postgres_app_password secrets/database_url
# Edit verilio.env locally: preserve owner/credentials and select a new unused volume,
# distinct project name and, for a same-host drill, a different loopback port.
```

Ensure the env version/repos match the selected recovery release; retain the target package's
reviewed configuration contract. Clear conflicting shell overrides and define `dc` as above.
After reviewing the new recovery volume/project/port, proceed:

```bash
set -euo pipefail
backup_dir=/absolute/path/to/accepted-backup
(cd "$backup_dir" && sha256sum --check SHA256SUMS)
dc config --quiet
# Pull/verify the matching release refs as above, then start only PostgreSQL.
dc up -d --wait --wait-timeout 180 postgres
# Only on the newly created empty recovery database, before starting migrations/API:
dc exec -T postgres pg_restore --username verilio_app --dbname verilio \
  --no-owner --no-acl --exit-on-error < "$backup_dir/database.dump"
dc exec -T postgres psql --username verilio_admin --dbname verilio \
  --set=ON_ERROR_STOP=1 --command='ANALYZE;'
dc up -d --wait --wait-timeout 180
dc ps -a
port=$(awk -F= '$1 == "VERILIO_GATEWAY_PORT" {print $2}' verilio.env)
./deploy/smoke-test.sh "http://127.0.0.1:$port"
```

PostgreSQL bootstrap recreates roles from the preserved secret files. Restore runs as the app
role without old ownership/ACLs; the dump includes migration history. Do not start migrations
before restoring the empty recovery database. Verify Business Settings, hierarchy, Time,
Reports, Invoices and PDF output against known backup data. Keep the affected volume until
recovery is accepted; only then change trusted private ingress deliberately. A restore drill
must stay separate from the active installation. These instructions are not a claim of completed
cross-version upgrade/rollback qualification.

## Safe stop and removal

From the selected package:

```bash
dc down
```

This removes containers/networks and **preserves the named PostgreSQL volume**. Restart using the
same package/config/secrets with `dc up -d --wait --wait-timeout 180`. Retain backups, env/secrets
and the release package. Explicit volume deletion permanently destroys user data; it is never
part of normal stop/update instructions. For intentional permanent removal, first verify an
accepted off-host backup and restore, stop the correct project, identify the exact volume and
obtain the owner's explicit approval before deleting data. Never prune unrelated installations.

## Troubleshooting

| Symptom | Check / action |
| --- | --- |
| Port already in use | Inspect `ss -ltn` and `dc ps -a`; choose an unused `VERILIO_GATEWAY_PORT`, then recreate Gateway. Keep loopback binding/private ingress. |
| Missing/unreadable secret | Check configured file paths and `stat` permissions locally, without printing contents. Directory `0700`, files `0444`; init script must exist at `deploy/postgres/init-app-role.sh`. Do not regenerate existing passwords. |
| Unexpected config | Shell variables override `verilio.env`. Clear only the named conflicting overrides above, check Docker context and run `dc config --quiet` / `dc config --images`. Never source/share credential files. |
| Pull/tag/architecture mismatch | Check exact published tag, repository-only values, anonymous access, expected RepoDigests and `linux/amd64`. Stop on mismatch; do not substitute a floating version or build an image as a workaround. |
| PostgreSQL unhealthy | Inspect `dc logs --tail 200 postgres`, disk space and selected volume. Do not delete the volume; secret changes do not rotate persisted credentials. |
| Migration failure | Inspect `dc ps -a` and `dc logs --tail 200 migrate`. API should not start after failure. Preserve backups/volume; investigate before retries or rollback. |
| API unhealthy | Check successful migration, secret readability and `dc logs --tail 200 api`; readiness must report database connected. |
| Gateway unhealthy | Check API health, port conflicts and `dc logs --tail 200 gateway`; run packaged smoke against the configured loopback port. |
| Data appears missing / owner mismatch | Compare `LOCAL_USER_ID` with the accepted recovery config. Restore the known owner value; do not invent a new owner or write ownership directly to SQL. |
| Volume mismatch | Compare `VERILIO_PGDATA_VOLUME`, Compose project and `docker volume inspect` with recorded configuration. Stop before writes; reselect the known volume rather than deleting either one. |

Health alone does not prove data recovery. Escalate unexplained failures with redacted logs,
version, digests and service status; never send secret files or credential-bearing URLs.
