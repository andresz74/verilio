# Fresh Private Source Installation

**IMPLEMENTED — OPERATIONAL CLEAN-HOST VALIDATION PENDING**

D10 is in progress. The scripts and offline checks are prepared; installation, reboot,
recovery and update handoff still require qualification on a fresh disposable Ubuntu
Server 24.04.5 LTS `linux/amd64` VM. This guide makes no validated-host compatibility claim.

## Choose the correct path

This path is for developers and advanced private self-hosters who deliberately build
trusted main source locally. The normal [prebuilt self-host path](SELF_HOSTING.md) uses
published application images and needs no source build. Official tagged builds remain
separate [release/runbook operations](../docs/08-private_alpha_self_hosted_deployment.md).
This installer accepts no release tag and publishes nothing.

The installer runs canonical `compose.prod.yml`: PostgreSQL → migrate → API → Gateway.
It does not create a second production stack or change the existing snapshot updater.

## Prerequisites and protected host selection

Prepare an ordinary private Linux amd64 host. Ubuntu Server 24.04.5 LTS is the **proposed
first qualification target**, not yet a validated D10 environment. Install dependencies
through the operator's reviewed OS/Docker procedures before invoking Verilio:

- Git with a full, non-shallow checkout of `andresz74/verilio`.
- Local rootful Docker Engine, Buildx and the Docker Compose plugin. Deployment-user and
  sudo Docker access must resolve to the same local daemon; remote contexts are refused.
- Bash, sudo, OpenSSL, curl, **jq**, iproute2 (`ss`) and GNU/Linux utilities: awk, sed,
  grep, find, sort, xargs, cmp, stat, install, readlink, tar, gzip, sha256sum, free, df,
  mktemp, uname, id, dirname, mkdir, mv, cp, chmod, chown, cat, wc, tr, tee, ln, rmdir,
  rm, sh and env.
- A deployment account with sudo and Docker access, which is effectively root access.
  Do not run the installer itself as root or with `sudo`.
- Outbound network access for source fetch, Docker base/PostgreSQL images and build-stage
  dependency installation. No GHCR credentials, registry login or application GHCR pull.

Host Node/npm/pnpm, Vite, TypeScript and uuidgen are unnecessary. The Docker build stage
contains the source toolchain; **Buildx is required** for this source path.

Admission checks reuse the snapshot updater's guards: **3 GiB combined available RAM plus
free swap**, and **12 GiB free** on the source checkout, source-install work-root, Docker
and host install/config/backup filesystems.
These are admission guards, **not universal hardware minimums or a build-success guarantee**.
Source build/export staging defaults to `/var/tmp`. The work root must be an existing
absolute physical directory (no symlink paths), writable by the deployment user, with the
existing **12 GiB admission headroom**. This is a build workspace, not persistent Verilio
state. `/tmp` itself does not need 12 GiB; small ordinary temporary files may still use it.
To select another disk-backed workspace, create it first and run:

```bash
VERILIO_SOURCE_INSTALL_WORK_ROOT=/path/to/disk-backed/workspace \
  ./deploy/install-from-source.sh --ref origin/main
```

Build/export staging can retain images and multiple compressed archives simultaneously.
Inspect `free -h`, `df -h` and `docker system df`; provision sufficient additional headroom.
The proposed lab allocation is 4 vCPU, 8 GiB RAM and 60 GiB disk, not a measured minimum.

The installer installs no apt/Docker dependencies, creates no swap, changes no firewall and
performs no Docker pruning. Confirm the intended host/context before proceeding. Port 8080
(or the explicitly selected port), the `verilio` project and `verilio_pgdata` volume must
be unused for a first install. Existing unfamiliar state is refused, never removed.

## Obtain source and run one command

Use a clean full official clone owned by the deployment account. `/srv/verilio/source` is
a recommended example location, not a requirement; another trusted checkout path is allowed.
Create your chosen checkout location deliberately before cloning. Do not clone as root.
The checkout must contain these installer scripts; a reviewed implementation checkout may
orchestrate an older selected main commit, but that commit must contain compatible canonical
build/export/runtime helpers.

From the repository root, as the deployment account:

```bash
./deploy/install-from-source.sh --ref origin/main
```

This explicitly fetches trusted `origin/main`, resolves it **once** to a full commit and
shows the requested ref, **installer_commit** (the full HEAD SHA of the clean caller checkout
containing the committed installer), **source_commit** (the full selected application SHA),
`main-<sha12>` version, platform, release/config paths
and Gateway loopback port before building. It uses a detached temporary worktree without
switching/resetting the caller's checkout. For a pinned main-line commit:

```bash
./deploy/install-from-source.sh --ref <full-40-character-main-line-SHA> --gateway-port 8080
```

A full SHA must be reachable from the freshly fetched trusted main. Abbreviated hashes,
other branches, local unrelated commits, tag input, dirty tracked files, untracked files,
shallow clones and untrusted origin URLs are refused. A clean detached caller checkout is
allowed. The installer file must exist in that commit. Qualification must record **both**
installer_commit and source_commit; they can differ because the reviewed installer checkout
can build a separately selected trusted main-line application commit. Only ports 1–65535 are accepted; default is 8080. An existing port listener fails
preflight. No floating runtime image identities are used.

The local images are `verilio-api:main-<sha12>` and `verilio-gateway:main-<sha12>` with full
source SHA/version/source OCI labels and `linux/amd64`. PostgreSQL remains `postgres:17.9-alpine`.
Existing partial image pairs or mismatched identities require inspection; they are not
silently overwritten. A complete matching pair can be reused only after provenance checks.

## What installation does

1. Validate arguments, host/prerequisites/resources, source, free port and absence of foreign state.
2. Pin source and acquire the ephemeral `/run/verilio-source-install.lock` without
   creating persistent installation directories.
3. Build/export in staging with the selected source's existing helpers; validate image metadata,
   IDs, manifest/checksums, archive provenance and byte-identical canonical runtime/helpers.
4. Create protected owner/config/secrets **after build/export verification**.
5. Resolve canonical Compose, checking local exact refs, no runtime builds, loopback-only
   Gateway and unpublished API/PostgreSQL.
6. Install a root-owned immutable archive release and align `/opt/verilio/current` with its env.
7. Invoke existing `server-deploy.sh` for provenance, archive load, migrations, startup and smoke.
8. Verify service health, migrate exit 0, exact images, owner/volume, publication and read-only mounts.
9. Take a checksummed baseline logical backup, then mark the receipt complete and report non-secret facts.

`test-release.sh` is not invoked: its full Chromium release gate needs host pnpm/Playwright and
seeded domain fixtures. D10 does not replace official release qualification or registry provenance.

## State and permissions

| Path | Purpose / permissions |
| --- | --- |
| `/etc/verilio` | Root-owned protected configuration, mode 0700. |
| `/etc/verilio/verilio.env` | Strict allowlisted plain assignments; root-owned 0600. |
| `/etc/verilio/secrets` | Root-owned directory, 0700. |
| `secrets/postgres_admin_password`, `secrets/postgres_app_password` | Independent random 64-hex credentials; 0444 within protected directory. |
| `secrets/database_url` | Matching app database URL, 0444; never printed. |
| `/srv/verilio/backups` | Root-owned logical backups directory, 0700. |
| `/opt/verilio/releases/verilio-main-<sha12>` | Root-owned immutable canonical release/archive. |
| `/opt/verilio/current` | Selected release symlink. |
| `/opt/verilio/source-install.receipt` | Root-owned 0600 installer receipt, not a credential store. |
| `verilio_pgdata` | Canonical persistent PostgreSQL named volume. |

OpenSSL generates one RFC4122 UUIDv4 `LOCAL_USER_ID` and independent passwords once. Preserve
owner, env, secrets, project/volume and ingress across updates/restores. The browser never
chooses the owner. Password files do not rotate existing database roles by themselves.

Secret files are readable by the non-root containers through individual read-only mounts.
The root-owned mode-0700 parent prevents unprivileged host traversal. Never print secrets,
source arbitrary env content, enable tracing, loosen the directory or commit protected files.
The generated env is strictly validated before existing helpers source it as shell.

## Private access and health

Gateway stays bound **only to `127.0.0.1:<port>`**. API and PostgreSQL have no host-published
ports. Direct public Internet exposure is unsupported; authentication, secure sessions and
public authorization remain future work. Use only trusted LAN/VPN/tailnet/private ingress.
The installer provisions no proxy/VPN/router rule and offers no wildcard/private-IP override.

For a browser on your trusted client, use an explicit SSH tunnel to the private guest address:

```bash
# Run on your client. Replace the account/private address; do not use a public endpoint.
ssh -N -L 127.0.0.1:18080:127.0.0.1:8080 deploy@<private-guest-IP>
```

Open `http://127.0.0.1:18080` on that client. Adjust the remote port if installation selected a
different Gateway port. The tunnel is a separate session and must be re-established after
reboot/disconnection; no automatic private ingress configuration is claimed.

On the guest, use the installed target runtime:

```bash
sudo docker compose --env-file /etc/verilio/verilio.env \
  -f /opt/verilio/current/compose.prod.yml ps --all
/opt/verilio/current/deploy/smoke-test.sh http://127.0.0.1:8080
```

Smoke covers SPA root/deep route, live/readiness and connected database. First use:
Settings → Business → Client → Project → optional Tasks → Timer. VM qualification will
record a recognizable Business Settings value and verify persistence through recreation/reboot.

## Failure, refusal and resume

Failure returns nonzero and names the phase; it never prints a misleading completion receipt.
Before selection, the installer leaves production selection unchanged. After state creation,
configuration, credentials, database volume, images/releases and recovery points are preserved.
There is no previous application version to roll back to on first install and no automatic
schema rollback, pruning or destructive cleanup.

A complete installation **refuses the fresh installer** and directs to the existing update path.
Unknown/foreign state refuses. A leftover `/run/verilio-source-install.lock` is not stolen: inspect the failed process and
protected receipt before any manual lock recovery.

For a reviewed failed installer-owned attempt only:

```bash
./deploy/install-from-source.sh --ref <same-full-40-character-SHA> --gateway-port 8080 --resume
```

Resume requires the identical **installer_commit** and **source_commit**, version, port,
protected installation paths, project and volume, a protected pending receipt, and complete
valid unchanged owner/config/secrets. The caller checkout must remain clean and at the
recorded installer commit. Its filesystem location is **not** stored in or bound to the receipt;
another clean checkout of the same installer commit may resume. The receipt binds a state
fingerprint to detect replacement even with syntactically valid credentials/owner. It never
regenerates values or changes selection to another release. Pin the original SHA: `origin/main`
may have advanced since failure. Never edit receipt/state to bypass a mismatch.

The receipt is strict format 2, root-owned mode 0600, and updated atomically as phases
advance (never reset to an earlier phase during resume):

- `state`: protected state preparation; no current symlink or runtime resources are authorized.
- `installed`: the immutable target is verified/installed; no current or runtime ownership yet.
- `selected`: selection is authorized just before creating the current symlink, so an interruption
  on either side of symlink creation can resume. Any current must point exactly to the target.
  Volumes/project containers are still forbidden.
- `runtime`: the expected current is in place and the deployment helper is about to run or has
  run. This intent marker is written **before** invoking it, allowing resources left by a failed
  startup to be preserved on resume; it is not proof that startup/health passed.

During every resume, `/opt/verilio/releases` must be empty or contain **only** the expected
physical target, which must pass provenance verification if present. Installed/selected/runtime
phases require that target; runtime additionally requires the exact current symlink. Foreign
release entries always refuse. Before runtime authorization, an existing `verilio_pgdata` volume
or `verilio` Compose project refuses, rather than being adopted. No foreign state is deleted.
The completion status is written only after health/security and backup succeed; completed
installations still refuse fresh-install reuse. Old/malformed receipt formats are not upgraded
or adopted automatically.

An interrupted bootstrap, missing file, unsafe permission, symlink, unknown assignment or
unsealed/inconsistent receipt **still refuses**, including with `--resume`. Preserve and investigate;
do not delete/regenerate secrets to make a retry work. Partial build image pairs likewise require
operator review. A failed specific startup may need reviewed container recreation before retry;
the installer does not automatically delete containers to bypass the existing deployment guards.

## Existing-host update handoff

After successful fresh installation, the intended existing-host private-main updater is:

```bash
cd /path/to/the/checkout-used-for-installation
VERILIO_SNAPSHOT_WORK_ROOT=/var/tmp ./deploy/nc110-deploy-main.sh
```

Use the safely shell-quoted `cd` command printed by the installer: it points to its **actual**
source checkout, not unconditionally to `/srv/verilio/source`. A relocated same-commit checkout
prints its new path without weakening installer identity checks. The explicit disk-backed
`/var/tmp` work root avoids requiring write access to the protected root-owned `/srv/verilio`
parent when the checkout is `/srv/verilio/source`; do not weaken that parent's ownership or
permissions to create updater scratch space.

Despite its historical name, its scope is an **already-configured private host**. It fetches
trusted current main, takes backups and uses the existing snapshot/provenance/deployment guards.
It does not provide bootstrap or a pinned arbitrary-release updater. **D10 handoff compatibility
is not operationally validated yet**; the clean-host VM gate must prove it. Tagged archive updates
remain the separate official release/runbook workflow. No cross-version upgrade qualification
is implied by this document.

## Backup, recovery and safe stop

The installer creates a baseline using existing `backup.sh` with the non-retaining `predeploy`
kind (so it expires no existing recovery points). It verifies backup checksums and reports the
path, never database credentials. Preserve env/secrets separately and keep encrypted off-host
copies. Take and verify a backup before every future update; test an isolated restore before
relying on recovery.

The existing full `restore-drill.sh`/`verify-data.sh` expects populated Invoice/domain fixtures;
it is not a fresh Settings-only install gate. Real D10 qualification still needs an isolated
logical restore of its actual data with the same owner and original Settings value. Do not
weaken comprehensive existing restore tests or call a fresh Settings-only restore that full gate.
Schema-incompatible rollback preserves the upgraded volume and restores the pre-update backup
into a separate compatible recovery target; never automate destructive down migrations.

Normal stop/removal preserves the named volume:

```bash
sudo docker compose --env-file /etc/verilio/verilio.env \
  -f /opt/verilio/current/compose.prod.yml down
```

Deleting the PostgreSQL volume or protected state destroys recovery-critical data and is a
separate deliberate manual operation after backups. Never use volume deletion for install retry,
normal stop or update. Failed install cleanup removes only invocation-owned temporary files,
never secrets, volumes, immutable releases or backups.

No ARM64, public hosting, D09 or D11 compatibility/qualification claims are made here.
