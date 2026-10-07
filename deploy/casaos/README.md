# Verilio on CasaOS (private amd64)

This is a thin CasaOS wrapper around Verilio's canonical Compose runtime, using the
immutable `v0.1.1-alpha.5` images. Display metadata omits the leading `v` only:
`0.1.1-alpha.5`. It is **not one-click** and is not a public App Store submission.

CasaOS **v0.4.15** compatibility validated on the tested private Debian 12 `linux/amd64`
environment with required bootstrap and trusted-private-interface configuration, using
Docker Engine 29.8.2 and Compose v5.6.0.
Other CasaOS releases/hardware, ARM64 and cross-version upgrades are not claimed.
The [current upstream metadata contract](https://github.com/IceWhaleTech/CasaOS-AppStore/blob/0909364b800950030e71ea82355a5969a1c08b39/docs/specs/compose-and-x-casaos.md)
uses top-level `name` and `x-casaos`, including localized English title/tips, Gateway
as `main`, string `port_map`, `amd64` architecture and the existing SVG icon.
No thumbnail or screenshot is required; no fake screenshots are included.

## Validated operational record

[D07 / issue #43](https://github.com/andresz74/verilio/issues/43) records the real alpha.5
package validation. Bootstrap created `/DATA/VerilioState` without printing credentials.
PostgreSQL/API/Gateway were healthy, migrate exited 0, liveness returned 200 and readiness
reported database connected. The dashboard tile launched Verilio successfully.
Gateway published only at `192.168.56.2:8080`; NAT `10.0.2.15:8080` refused connections,
API/PostgreSQL had no published ports, and the init bind had `RW=false`.

Business Settings validation data survived refresh, CasaOS stop/start, real Gateway
recreation (`d727a43cb960` → `96366d31390e`), host reboot and same-version reinstall.
Uninstall with userdata deletion **unchecked** removed containers/app definition but
preserved PostgreSQL data and protected config/secret/support hashes. Reinstall **without
rerunning bootstrap** recovered the original data and unchanged owner
`7e35e88b-8947-4f89-88ea-6882debe4850`. Cross-version CasaOS upgrades remain unvalidated.

The package includes three CasaOS v0.4.15 normalization adaptations: string-valued
`API_PORT: "3000"` avoids numeric environment parsing failures; migrate `on-failure`
avoids CasaOS rewriting `"no"` to `unless-stopped` while keeping successful migration
stopped; long-syntax init bind `read_only: true` avoids CasaOS dropping short-syntax `:ro`.
Offline tests protect these adaptations and the unchanged generic private-safe runtime.

## Security and ingress

Use only a trusted private LAN/VPN/tailnet/interface. Verilio is fixed-owner mode;
authentication, secure sessions and public authorization are future work.
**Direct public Internet exposure is unsupported.** Do not forward router/WAN ports.
API and PostgreSQL publish no host ports. The generic production Compose file is
unchanged and remains loopback-only.

CasaOS opens the browser directly at its host address and `x-casaos.port_map`; it
does not proxy a remote browser to host loopback. This package defaults safely to
`127.0.0.1:8080:8080`, which will not work for a remote CasaOS tile until configured.
**Before clicking Install in Custom Install, change Gateway's Host field from
`127.0.0.1:8080` to `<selected trusted-private host IP>:8080`.** The disposable test
network uses `192.168.56.2:8080`. Retain container port 8080.

Identify the host's LAN/VPN/private interface with `ip -brief address` and verify
that its address is reachable only through your intended trusted network. Do not
choose the WAN/NAT interface or use `0.0.0.0` as the normal path. Any environment
requiring all-interface exposure needs a separate security review. Keep the chosen
address stable across reboots. If changing the published port, also change CasaOS's
Web UI port (`x-casaos.port_map`) to match.

## Prepare protected state before import

Transfer only this complete package (including `support/init-app-role.sh`) to the
intended host. No Verilio source, Node/pnpm or source builds are needed there.
Prerequisites: Bash, OpenSSL, ordinary Linux utilities, Docker/Compose and root/sudo.
From the transferred package:

```bash
sudo ./bootstrap.sh
```

Bootstrap accepts no arguments. It creates one protected external state tree:

```text
/DATA/VerilioState/
├── config/runtime.env
├── secrets/postgres_admin_password
├── secrets/postgres_app_password
├── secrets/database_url
├── postgres/
└── support/init-app-role.sh
```

It generates a stable UUID and independent secure random database passwords once,
derives the app database URL, and copies the canonical PostgreSQL role initializer.
It never prints credentials. `runtime.env` contains only `LOCAL_USER_ID` and
`LOG_LEVEL=info`; credentials remain file-backed through `DATABASE_URL_FILE`.
Directories are `0700`, runtime config `0600`, secrets `0444` and init support `0555`.
The protected host directories restrict traversal; readable secret files permit
non-root containers to read their individual Docker bind-mounted secret files.
PostgreSQL manages its own data directory ownership after startup.

A rerun preserves complete valid state. Partial/inconsistent state, malformed
credentials/owner, unexpected permissions or support files cause failure; bootstrap
does not regenerate or silently repair them. It cannot validate passwords against a
stopped database or detect replacement of one valid UUID with another. Stop and
investigate changes against your recovery record and backups.
Never run shell tracing or print secret files. Do not place database credentials or
owner overrides in CasaOS's UI/global environment settings. CasaOS can inject global
environment variables into services; review conflicts with `LOCAL_USER_ID` and
`LOG_LEVEL` and verify the actual owner against `runtime.env` after import.

**This tree is recovery-critical**, outside `/var/lib/casaos/apps` and CasaOS-owned
app config. There is no Docker named volume. Preserve the same tree, owner and
credentials across restart/recreate/reinstall. Changing the UUID hides existing
owner-scoped data; changing password files does not rotate persisted DB roles.

## Custom Install and first use

1. Run bootstrap on the intended host before importing.
2. In CasaOS App Store choose Custom Install, import this `docker-compose.yml`.
3. Review four services (`postgres`, `migrate`, `api`, `gateway`), absolute state
   paths and file secrets. Change **Gateway Host** to the selected trusted-private
   address as above. API/PostgreSQL must have no published ports.
4. Install. CasaOS pulls the published images; no GHCR login/token is needed.
5. Open the Verilio tile on the private CasaOS address. Check health and known data.

Exact images (no builds or floating aliases):

```text
ghcr.io/andresz74/verilio-api:v0.1.1-alpha.5
ghcr.io/andresz74/verilio-gateway:v0.1.1-alpha.5
postgres:17.9-alpine
```

Verify the saved CasaOS definition after import; it is normally under
`/var/lib/casaos/apps/verilio-casaos/docker-compose.yml`. Use the actual app path if
CasaOS assigned a different name. Run the commands below with sudo: the root-owned
`runtime.env` is deliberately unreadable by ordinary users, even Docker-group members.
Docker access is root-equivalent. Never share
unredacted config/inspect output that includes CasaOS global environment values.

```bash
app_compose=/var/lib/casaos/apps/verilio-casaos/docker-compose.yml
sudo docker compose -f "$app_compose" config --quiet
sudo docker compose -f "$app_compose" config --images
sudo docker compose -f "$app_compose" ps -a
# Review logs locally; redact before sharing.
sudo docker compose -f "$app_compose" logs --tail 100 postgres migrate api gateway
curl --fail --silent --show-error http://192.168.56.2:8080/health/live
curl --fail --silent --show-error http://192.168.56.2:8080/health/ready
```

Replace the example address with your selected private host IP. Expected:
PostgreSQL healthy → migrate exits 0 → API healthy → Gateway healthy;
readiness reports database connected. Confirm Gateway has only the selected private
binding, with API/PostgreSQL unpublished. A container's declared/exposed port alone
is not a published host port. Check actual Docker port mappings.

First use: **Settings → Business → Client → Project → optional Tasks → Timer**.
Save an unmistakable Business Settings value, then verify it after lifecycle changes.
The browser never supplies an owner ID.

## Stop/start, recreate and reboot

Use CasaOS's stop/start controls for ordinary restarts; these may retain container
IDs. For same-version recreation, change a harmless non-secret app setting through
CasaOS and save, then verify container IDs actually change. Preserve all state
paths, file secrets, owner and private binding. Verify health and Business Settings,
not container status alone. Normal host reboot should return the stack through its
existing restart policies; migration remains a one-shot service.

Only same-version alpha.5 recreation/reinstall is covered by this slice. **Real
cross-version CasaOS upgrade validation is pending**: only one published registry
release currently exists. Before any future update, review the target package/runtime,
release notes and schema compatibility; retain backups and the prior recovery set.
The [generic guide](https://github.com/andresz74/verilio/blob/main/deploy/SELF_HOSTING.md) describes logical backup and schema-aware
rollback. Its named-volume/env paths must not be substituted into this bind-backed
CasaOS deployment.

## Backup, uninstall and recovery

Back up before update or deletion. Use a logical PostgreSQL dump from the active
CasaOS service, verify it and test restore on a separate private recovery target.
Keep an encrypted off-host copy plus protected `config/`, `secrets/`, support files
and the matching package/image identity. Do not copy live PostgreSQL files as a
backup or publish recovery archives.

```bash
set -euo pipefail
umask 077
backup_dir="$HOME/verilio-backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
sudo docker compose -f "$app_compose" exec -T postgres pg_dump \
  --username verilio_admin --dbname verilio --format=custom --no-owner --no-acl \
  > "$backup_dir/database.dump"
test -s "$backup_dir/database.dump"
sudo docker compose -f "$app_compose" exec -T postgres pg_restore --list \
  < "$backup_dir/database.dump" > "$backup_dir/restore-list.txt"
# Contains credentials; protect/encrypt before storing off-host.
sudo tar -C /DATA/VerilioState -czf - config secrets support \
  > "$backup_dir/recovery-config.tar.gz"
sha256sum "$backup_dir/database.dump" "$backup_dir/recovery-config.tar.gz"
```

CasaOS uninstall removes its app definition/containers. The external
`/DATA/VerilioState` is intentionally retained. The real Verilio uninstall test left
**Delete userdata (config folder)** unchecked; a separate disposable lifecycle probe
also preserved external state with it checked. Do not treat that checkbox as a secure
Verilio data-erasure mechanism. Reimport the same reviewed package and select the same
private binding. Bootstrap is not required again for complete existing state; an optional
rerun only validates/preserves it. The tested reinstall did not rerun bootstrap;
installation reconnects to the existing database. Do not generate a new owner or
passwords. Verify health and existing application data after reinstall.

Removing `/DATA/VerilioState` is a separate **destructive manual action** that deletes
data and recovery configuration. Do it only after stopping/removing the correct app,
verifying an accepted off-host backup and restore, and deliberately approving permanent
erasure. It is never a normal stop/update/reinstall step. Do not prune unrelated data.

## Troubleshooting

- Tile refuses connection: inspect Gateway Host and chosen private interface;
  loopback is deliberately unreachable from another machine. Check port conflicts.
- Missing secret/config: confirm bootstrap succeeded and absolute paths survived
  import. Check permissions without printing files; never regenerate partial state.
- Migration/API failure: inspect local logs, DB health and file-secret mounts.
  Preserve data; do not delete the PostgreSQL directory to bypass a failure.
- Missing data: compare actual owner and PostgreSQL bind source with the protected
  recovery record. CasaOS global env overrides can take precedence over env_file.
- Recreate/uninstall changes: inspect the CasaOS-saved Compose definition and actual
  mounts, not just the original import file. Verify the protected state survived.

No public Internet readiness, universal CasaOS/ZimaOS, Portainer, Proxmox or ARM64
compatibility is claimed by this package.
