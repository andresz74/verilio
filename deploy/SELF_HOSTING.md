# Verilio Prebuilt Self-Host Package

This D02 package consumes **prebuilt application images** using a copy of the canonical
production Compose runtime. It establishes package/configuration shape only: it does not
publish images, select a registry namespace, generate secrets, or install/deploy Verilio.
Official alpha.5 images have been published. D05 verified this package on a clean isolated
Ubuntu 24.04.5 LTS `linux/amd64` host (Docker Engine 29.1.3 / Compose 2.40.3): anonymous pull with
exact published digest matches, canonical startup/migrations/health/smoke, loopback-only exposure,
and Business Settings persistence after recreation all passed without source builds or Node/pnpm.
See [issue #39](https://github.com/andresz74/verilio/issues/39) for exact refs/digests and evidence.
D05 is complete; D06 generic install/update documentation remains next/planned. The configured
repositories and explicit version must identify real, compatible Verilio images before startup;
test-only `registry.example.invalid` inputs are not runnable. Initial production architecture
is `linux/amd64`; other architectures are not claimed.

## Configuration before startup

Work from the directory containing `compose.yml`:

```sh
cp verilio.env.example verilio.env
# Edit verilio.env and create the three secret files before startup.
docker compose --env-file verilio.env -f compose.yml config --quiet
```

Keep the version separate from the API/Gateway repository names and pin an explicit immutable
version, never `latest`. Replace the `LOCAL_USER_ID` placeholder once with a stable UUID.
It is server-controlled; the browser never chooses the owner. Preserve it, the volume name,
and credentials across updates/restores. Shell environment values override the env file in
Compose; clear conflicting overrides when checking or using this package.

Create these files locally; none is generated or included in this package:

- `secrets/postgres_admin_password`: database administrator password.
- `secrets/postgres_app_password`: separate application-role password.
- `secrets/database_url`: `postgresql://verilio_app:APPLICATION_PASSWORD@postgres:5432/verilio`
  using the same application password (URL-encode it if needed).

Protect the `secrets` directory with mode `0700` and restrict access to the deployment account.
File-backed Compose secrets need read access inside the non-root containers; mode `0444` on
these files works when protected by that directory. Do not commit or log credentials.
Relative secret paths and the PostgreSQL init bind mount resolve against the directory
containing `compose.yml`. When invoking from elsewhere, pass absolute `--env-file` and `-f`
paths; the env-file argument itself is resolved from the caller's working directory.

## Runtime and verification

PostgreSQL stores authoritative data in the persistent named volume `verilio_pgdata` by default.
Do not delete that volume during updates/removal; back up the database and test restore before
upgrading. The one-shot `migrate` service runs after PostgreSQL is healthy and before the API;
Gateway waits for API health. API and PostgreSQL publish no host ports. Gateway remains
loopback-only at `127.0.0.1:8080` (or the configured `VERILIO_GATEWAY_PORT`).

After a separately managed startup with compatible images and secrets, verify from this
directory, using the configured port:

```sh
./deploy/smoke-test.sh http://127.0.0.1:8080
```

The smoke helper requires Bash and curl; it checks the SPA, a deep route, and `/health/live`
and `/health/ready`. First use: **Settings → Business → Client → Project → optional Tasks → Timer**.
No seed data is required. Generic install/update, backup/restore, and schema-aware rollback
guidance remain later distribution work; this is not the existing checksummed archive release
bundle and must not be passed to `server-deploy.sh`.

## Private-network boundary

Use only LAN, VPN, tailnet, or another trusted private network with appropriate private ingress.
Direct public Internet exposure is unsupported; it still requires authentication, secure
sessions, and authorization. Self-hosting does not implement these controls. CasaOS, Portainer,
and Proxmox compatibility are **not yet claimed**.
