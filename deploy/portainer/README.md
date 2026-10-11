# Verilio on Portainer Docker Standalone

This thin package uses the canonical Verilio runtime with external host state.
It targets a private `linux/amd64` Docker Standalone environment. It is not a
one-click install, a Swarm/Kubernetes/Edge Stack package, or a Business
Edition-specific Git-relative-path deployment.

D08 is complete for Portainer CE 2.45.1 Docker Standalone on the tested private
Debian 12 linux/amd64 host with Docker Engine 29.8.1 and host Docker Compose
plugin v5.6.0. Validation required bootstrap, explicit Stack variables,
trusted-private-interface Gateway binding and host networking that makes the
selected private address available before Docker container restore.

## Private-network boundary

Verilio is a fixed-owner private alpha. Use a trusted LAN, VPN or tailnet;
direct public Internet exposure is unsupported. Authentication, secure sessions
and public authorization remain future work. Only Gateway publishes a host
port. API and PostgreSQL remain unpublished.

Choose one trusted-private address on the **Docker target host**, not the
Portainer Server's address when managing a remote environment. For the
validation host this is `192.168.56.3`; Portainer itself is at
`https://192.168.56.3:9443`. Check `ip -brief address` on the target and select an
interface reachable only from the intended trusted network. Do not select a
public/NAT address or `0.0.0.0`. Missing ingress/owner values fail interpolation;
Compose cannot establish whether an operator-supplied address is trusted.

## Prepare the target host

Transfer only this complete package directory, including `support/`, to the
Docker target host. The runtime host needs Docker, a Portainer administrator
account and OpenSSL for bootstrap; no Verilio source checkout, Node, pnpm or
image build is needed. Administrator access is required for the host binds and
security options. Do not install this package over an existing Verilio state tree
without reviewing its identity and backup first.

From the transferred package directory:

```bash
sudo ./bootstrap.sh
sudo sed -n 's/^LOCAL_USER_ID=//p' /var/lib/verilio-portainer/config/runtime.env
```

The second command prints only the non-secret owner UUID. Keep it stable across
stop/start, redeploy, restore and stack recreation. The browser never selects
an owner. Bootstrap accepts **no arguments** and requires root/sudo. It creates:

```text
/var/lib/verilio-portainer/
├── config/runtime.env
├── secrets/database_url
├── secrets/postgres_admin_password
├── secrets/postgres_app_password
├── postgres/
└── support/init-app-role.sh
```

This external tree is recovery-critical and is not Portainer stack/project
storage. Bootstrap generates one owner and independent random DB passwords
once. `runtime.env` contains only `LOCAL_USER_ID` and `LOG_LEVEL=info`. Credentials
remain files; never enter them into Portainer variables, YAML, screenshots or
logs. `DATABASE_URL_FILE` remains the API/migration credential interface.

Directories are mode `0700`, config `0600`, secrets `0444` inside the protected
secret directory, and the initializer `0555`. File readability lets the
unprivileged application container read its individual mounted secret; parent
protection prevents unprivileged host traversal. PostgreSQL may take ownership
of its data directory. A complete valid bootstrap rerun preserves state;
partial, malformed, mismatched or unsafe state fails without regeneration or
repair. Preserve and investigate failures; do not delete the tree to bypass them.

## Deploy the stack

In the intended **Docker Standalone** environment choose **Stacks → Add stack**.
Name the stack `verilio-portainer`. Use **Web editor** and paste this package's
`docker-compose.yml`, or use **Upload** to upload that file. Uploading Compose
alone does not transfer host support files: bootstrap must already have run on
the Docker target host.

Before deployment, enter these non-secret Stack environment variables:

| Variable | Value |
| --- | --- |
| `LOCAL_USER_ID` | Exact UUID printed from the protected `runtime.env` |
| `LOG_LEVEL` | `info` |
| `VERILIO_GATEWAY_HOST_IP` | Your selected trusted-private target-host IP, e.g. `192.168.56.3` |
| `VERILIO_GATEWAY_PORT` | `8080` (choose another free port deliberately if needed) |

Portainer creates its own `stack.env` for interpolation. The stack explicitly
maps these values into the appropriate services; it does not use host
`env_file`, and you must not upload the secret files. Do not use Portainer's
Swarm-only Secrets UI.

The package pins these existing images; there are no builds or floating tags:

- `ghcr.io/andresz74/verilio-api:v0.1.1-alpha.5` (API and migrate)
- `ghcr.io/andresz74/verilio-gateway:v0.1.1-alpha.5`
- `postgres:17.9-alpine`

Deploy without GHCR credentials: official application images are public.
PostgreSQL initializes with checksums and the canonical restricted app-role
initializer; migrate completes before API, and healthy API precedes Gateway.
Migrate's `restart: "no"` is intentional: success is a stopped `Exited (0)`
container, not an unhealthy always-running service.

## Verify health and first use

Wait for deployment completion, not just an accepted background update request.
In Portainer's stack container list verify PostgreSQL, API and Gateway are
healthy and migrate is `Exited (0)`. Inspect exact image references and mounts:
secret files and the initializer must be read-only. Confirm only Gateway has a
host-published port, on the chosen private IP. From the target host you can list
all four services, including the completed migration:

```bash
docker ps -a --filter label=com.docker.compose.project=verilio-portainer \
  --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
```

From a trusted client, substituting your configured IP/port:

```bash
curl --fail http://192.168.56.3:8080/health/live
curl --fail http://192.168.56.3:8080/health/ready
```

Live must return HTTP 200; readiness must report the database connected. Open
`http://192.168.56.3:8080/`, refresh and check a deep route such as `/settings`.
First use: Settings → Business → Client → Project → optional Tasks → Timer.
Create a recognizable Business Settings value and verify it survives refresh.
The Portainer administrator's access does not add Verilio application login.

## Stop/start, redeploy and reboot

Use Portainer **Stop this stack**, then **Start this stack**. In the reviewed
CE release Stop removes stack containers and Start redeploys the retained
definition. External state must remain; check health, owner, binding and saved
Business Settings after Start.

For same-version changes use the stack editor's **Update the stack** path,
preserving all four variables and external paths. A harmless Gateway environment
marker can force a real recreate during validation; verify its container ID
changes, then verify health and data. Never change owner or regenerate secrets
to make a redeploy work. Migration may run again and must complete successfully.
Back up before updates and use the target release's reviewed runtime/package.
Cross-version Verilio upgrade validation remains pending; alpha.5 same-version
lifecycle testing does not qualify schema rollback or a future release.

### Host reboot prerequisite and failed-bind recovery

The selected stable private interface/address must be reliably available before
Docker restores containers bound to that address. Use a stable address or DHCP
reservation and configure boot readiness through the host's actual network
manager. Ordering Docker after `network-online.target` alone does not prove
that a particular hotplug interface has acquired its address.

On the tested Debian ifupdown host, `allow-hotplug enp0s8` let Docker restore
Portainer and Gateway before DHCP supplied `192.168.56.3`. Both failed with
`cannot assign requested address`. The tested fix made that interface
boot-managed. This is an **ifupdown example**, not guidance for every distribution
or network manager; review the host configuration and retain console access
before changing networking:

```text
auto <private-interface>
iface <private-interface> inet dhcp
```

The tested interface was `enp0s8`. Do not use `0.0.0.0` as a workaround. After a
failed specific-IP bind, `docker start <container>` may start the container
internally without restoring the failed host-port publication. In the tested
recovery, affected Portainer and Gateway containers had to be **recreated after
the interface was available**, preserving their configuration and external
state. Recover Portainer through its original reviewed installation definition,
then recreate Gateway through the stack update path. Verify the actual published
ports and endpoint reachability, not just running container status.

After that host fix and recreation, a second reboot passed: Portainer returned
on `192.168.56.3:9443`, Gateway on `192.168.56.3:8080`, PostgreSQL/API/Gateway were
healthy, migrate remained `Exited (0)`, readiness reported database connected,
NAT remained closed and Business Settings survived with the same stable
`LOCAL_USER_ID`.

## Backup and recovery

Back up before every update or destructive action. Keep a verified logical DB
backup and a separately protected copy of config/secrets/support. Store encrypted
copies off-host and test restoration before relying on them. Never copy a live
PostgreSQL bind directory as the only consistent backup.

Run on the target host as a Docker administrator. This example prints no
password and fails rather than leaving a final-named partial dump:

```bash
set -euo pipefail
umask 077
backup_dir="$HOME/verilio-backup-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 0700 "$backup_dir"
pg=$(docker ps --filter label=com.docker.compose.project=verilio-portainer \
  --filter label=com.docker.compose.service=postgres --format '{{.ID}}')
[[ -n "$pg" && "$pg" != *$'\n'* ]]
docker exec "$pg" sh -c \
  'export PGPASSWORD="$(cat "$POSTGRES_PASSWORD_FILE")"; exec pg_dump -U "$POSTGRES_USER" -d verilio --format=custom' \
  > "$backup_dir/verilio.dump.partial"
[[ -s "$backup_dir/verilio.dump.partial" ]]
docker exec -i "$pg" pg_restore --list < "$backup_dir/verilio.dump.partial" > /dev/null
mv "$backup_dir/verilio.dump.partial" "$backup_dir/verilio.dump"
sudo tar -C /var/lib/verilio-portainer -cf - config secrets support \
  > "$backup_dir/recovery.tar"
[[ -s "$backup_dir/recovery.tar" ]]
```

`recovery.tar` contains secrets: keep it protected, encrypt before off-host
transfer, and never attach it to an issue. Archive-list validation does not
replace a real restore test. Restore the exact owner and credential identities
into a safe separate target, restore the logical DB backup into compatible
PostgreSQL, and verify health/data before switching ingress. Schema compatibility
determines which application release can safely use the restored database.

## Delete and recreate

Portainer **Delete this stack** removes its stack resources/definition; it does
not own `/var/lib/verilio-portainer`. Real validation confirmed all stack
containers were removed while config, secrets, PostgreSQL data and canonical
initializer survived. Recreate the same `verilio-portainer` stack from this
Compose file with the **same** Stack variables, without rerunning bootstrap or
regenerating state. The tested recreation returned all services healthy, migrate
`Exited (0)`, database connected and original Business Settings with the same
stable `LOCAL_USER_ID`.

Deleting `/var/lib/verilio-portainer` is a separate manual, destructive operation
that destroys recovery-critical data and credentials. It is never part of normal
stop/update instructions. Back up and verify recovery before considering removal.

## Troubleshooting and limits

- Missing interpolation value: enter the exact owner and private IP in Stack
  environment variables; do not substitute DB credentials.
- Missing/unreadable secret or initializer: verify bootstrap completed on the
  Docker target host and absolute files exist with the documented permissions.
  Do not move them into Portainer's project workspace or regenerate them.
- Deployment blocked by permissions: use a Portainer administrator; bind mounts
  and `security_opt` can be restricted for regular users.
- Port in use/wrong interface: select a free port on one trusted-private host
  address and update its variable; do not broaden the bind.
- PostgreSQL unhealthy or migration failed: inspect the relevant container logs
  in Portainer. Preserve state; do not delete the DB to retry initialization.
- API/Gateway unhealthy: inspect logs and dependency health, then verify private
  connectivity. Redact credentials before sharing logs.
- Empty/missing user data: compare Stack `LOCAL_USER_ID` with `runtime.env` and
  inspect the PostgreSQL bind source. Restore the original identities/paths;
  avoid creating another owner or empty data tree.
- Image mismatch: verify the exact pinned refs and `linux/amd64` target. Do not
  replace tags with floating aliases or build locally.

No universal Portainer, Swarm, Kubernetes, Edge, ARM64, public Internet readiness
or cross-version upgrade claim is made. D09 remains outside this work.

## Operational validation record

The Web editor path passed on the versions above. Compose upload is documented
as an alternative, not a separately qualified deployment path. PostgreSQL/API/
Gateway were healthy, migrate exited 0, live returned 200 and readiness reported
database connected. Gateway published only `192.168.56.3:8080`; NAT
`10.0.2.15:8080` refused connections and API/PostgreSQL were unpublished. The
database URL secret and initializer were mounted `RW=false`.

Business Settings survived refresh, Stop/Start, a real Gateway recreate
(container ID changed), the corrected host reboot and stack deletion/recreation
without bootstrap regeneration. The same stable `LOCAL_USER_ID` was preserved.
Only same-version alpha.5 lifecycle was qualified.

| Image | Verified digest |
| --- | --- |
| `ghcr.io/andresz74/verilio-api:v0.1.1-alpha.5` | `sha256:9d76436b4dd86cbca0b8a53cfe42be7554878b7e98d69298cee568364e1450e6` |
| `ghcr.io/andresz74/verilio-gateway:v0.1.1-alpha.5` | `sha256:dcb455a392453ac5e6514bb6a1047095df49612263e25cbe9724494ef21fceb8` |
| `postgres:17.9-alpine` | `sha256:c7526c0f6c3f30260a563d7bcf8ad778effac59a44f8ffa86678c35418338609` |
