# Verilio Self-Hosted Distribution Plan

## Document Control

**Product:** Verilio\
**Document:** Self-Hosted Distribution Plan\
**File:** `docs/09-verilio_self_hosted_distribution_plan.md`\
**Status:** Accepted direction; execution plan v0.1\
**Date:** 2026-10-05\
**Depends on:**

- [Product requirements](01-verilio_product_requirements_document.md)
- [Technical architecture](05-verilio_technical_architecture.md)
- [MVP implementation plan](06-verilio_mvp_implementation_plan.md)
- [Current private-alpha deployment runbook](08-private_alpha_self_hosted_deployment.md)

**Distribution strategy:** Private/self-hosted first\
**Canonical runtime:** Docker Compose + PostgreSQL\
**Public SaaS:** Optional later; authentication decision still required\

---

# 1. Purpose

This plan defines how Verilio evolves from a technically complete, containerized private alpha into an application that is easy for other developers and self-hosters to install, update, back up, and recover on their own infrastructure.

This work packages the existing runtime. The TypeScript modular monolith, React/Vite, Fastify,
PostgreSQL, Drizzle, and server-authoritative business state remain unchanged.

Verilio already has the core runtime components required for self-hosting:

```text
gateway
api
migrate
postgres
```

The remaining work is distribution, installation UX, release publishing, platform compatibility, and operational documentation.

---

# 2. Product/Distribution Decision

Verilio is **private/self-hosted first** (accepted ADR-015 in
[docs/05](05-verilio_technical_architecture.md)). Public hosted SaaS remains an optional later
direction; its authentication and hosted-storage provider decisions remain open.

The first supported deployment boundary is:

```text
private LAN
private VPN
tailnet
other trusted private network
```

Direct public Internet exposure is unsupported. Public hosting requires authentication,
secure session management, and server-side authorization; self-hosting does not solve those.
`LOCAL_USER_ID` remains server-controlled, and the browser never chooses the owner.

The desired positioning is eventually:

> **Self-host Verilio anywhere you run Docker.**

Example environments may include:

- a normal Linux server;
- a Proxmox VM running Docker;
- CasaOS;
- Portainer;
- a NAS/homelab Docker environment.

These platform claims must be validated before being marketed as supported.

---

# 3. Goals

## 3.1 Primary Goals

1. Make a released Verilio build installable without Node.js or pnpm on the target host.
2. Make Docker Compose the canonical self-hosted runtime contract.
3. Publish immutable official application images.
4. Provide a simple generic install package for a new private host.
5. Preserve the existing source-based build/deploy path for developers.
6. Keep upgrades safe and version-aware.
7. Preserve PostgreSQL data, backups, and rollback behavior.
8. Support common homelab platforms through thin packaging/documentation layers.
9. Keep the runtime provider-neutral.
10. Keep the private/public authentication boundary explicit.

## 3.2 Secondary Goals

- Reduce setup knowledge required from a first-time reviewer.
- Make current version/source identity obvious.
- Make health verification simple.
- Make backup/restore instructions discoverable.
- Create a credible foundation for CasaOS/Portainer/Proxmox-friendly marketing.
- Keep official release distribution reproducible.

---

# 4. Non-Goals

This plan does not include:

- public SaaS authentication;
- public Internet exposure by default;
- teams or user management;
- Kubernetes;
- Redis or queues;
- automatic DNS setup;
- automatic router/firewall configuration;
- automatic Tailscale account creation;
- automatic Cloudflare account/tunnel creation;
- a native Proxmox application;
- destructive automatic down migrations;
- replacing PostgreSQL with SQLite merely for packaging;
- maintaining separate application forks per platform.

---

# 5. Current Baseline

The core MVP is complete and private-alpha dogfooding is active. As of this plan, Verilio has:

- React/Vite web build;
- Fastify API;
- PostgreSQL 17;
- checked-in migrations;
- one-shot migration container;
- Caddy gateway container;
- Docker Compose production stack;
- health/readiness endpoints;
- production smoke test;
- backup/restore tooling;
- release manifests/checksums;
- immutable tagged release workflow;
- commit-addressed `main-<sha>` snapshot workflow;
- a proven private deployment on a low-resource Ubuntu host.

D01 is complete via [issue #23](https://github.com/andresz74/verilio/issues/23) and
[PR #24](https://github.com/andresz74/verilio/pull/24). It parameterizes image repositories and
verifies Compose interpolation without pulling registry images. Defaults, source snapshots,
and official build/export/provenance behavior remain unchanged.

D02 adds a registry-neutral prebuilt package generator beside those flows. It creates a Compose
package and environment example without images, secrets, or runtime installation.

Official release distribution now includes published GHCR images alongside the existing
checksummed local image archives. The first publication, `v0.1.1-alpha.5`, passed anonymous
verification. D05 clean-host installation passed on Ubuntu 24.04.5 LTS `linux/amd64`; there is
no generic fresh-host installer or validated CasaOS/Portainer/Proxmox package yet. The NC110 is the current
constrained-host example, not a required host.

---

# 6. Canonical Runtime

The canonical runtime remains:

```text
Browser
  ↓
private network ingress
  ↓
Gateway
  ├── static SPA
  ├── /api → API
  └── /health → API
        ↓
      API
        ↓
   PostgreSQL

migrate
  ↓
PostgreSQL before API readiness
```

The canonical deployment contract must remain usable regardless of whether application images were:

- built locally from source; or
- pulled from an official registry.

---

# 7. Supported Installation Models

These are the two accepted models for the same runtime. D05 validated the generated prebuilt
package with published alpha.5 images on a clean private Linux host. The full generic install/update
guide (D06) and fresh source installer (D10) remain future deliverables.

## 7.1 Model A — Source-Based Installation

Audience:

- developers;
- advanced self-hosters;
- private-alpha dogfooding;
- contributors testing unreleased `main`.

Conceptual flow:

```text
clone repository
  ↓
resolve exact commit/version
  ↓
build Docker images
  ↓
create immutable snapshot/release
  ↓
run canonical production stack
```

Current update workflow for an already-configured private host (not a fresh install):

```sh
cd /srv/verilio/source
./deploy/nc110-deploy-main.sh
```

A fresh source installation script may be added later.

## 7.2 Model B — Prebuilt Container Installation

Audience:

- normal self-hosters;
- CasaOS/Portainer users;
- Proxmox users running a Docker VM;
- NAS/homelab environments;
- users who do not want to build from source.

Conceptual flow:

```text
obtain released Compose package
  ↓
configure .env / secrets
  ↓
pull official images
  ↓
docker compose up -d
  ↓
health check
```

This should become the easiest installation path for released versions.

---

# 8. Image Distribution Strategy

## 8.1 Accepted Official Registry Contract

D03 selects GitHub Container Registry (GHCR) with these canonical repository-only values:

```text
ghcr.io/andresz74/verilio-api
ghcr.io/andresz74/verilio-gateway
```

The non-secret machine-readable contract is
[`deploy/official-images.env`](../deploy/official-images.env):

```env
VERILIO_OFFICIAL_API_IMAGE=ghcr.io/andresz74/verilio-api
VERILIO_OFFICIAL_GATEWAY_IMAGE=ghcr.io/andresz74/verilio-gateway
VERILIO_OFFICIAL_PLATFORM=linux/amd64
```

It contains only plain literal assignments, no release version, credentials, or interpolation.
The D04 publishing helper consumes it. D05 passed these repositories to the D02 exporter, which
stays registry-neutral and accepts repositories as arguments. Current runtime env defaults remain `verilio-api` and
`verilio-gateway` for the existing local/archive/source workflows.

Official GHCR packages are **public** for the first successfully published release,
`v0.1.1-alpha.5`; both exact image tags passed anonymous verification in
[workflow run 37318991060](https://github.com/andresz74/verilio/actions/runs/37318991060).
The refs/digests and source identity are recorded in section 23. D05 verified anonymous pull,
canonical startup, and persistence/recreation on a clean Ubuntu 24.04.5 LTS `linux/amd64` host.
D06 generic install/update documentation remains planned.

## 8.2 Version and Release Eligibility

An official container tag must **exactly equal the immutable Verilio Git release tag**.
For example:

```text
Git tag: v0.1.1-alpha.5
API: ghcr.io/andresz74/verilio-api:v0.1.1-alpha.5
Gateway: ghcr.io/andresz74/verilio-gateway:v0.1.1-alpha.5
```

`VERILIO_VERSION` remains the explicit tag input. `VERILIO_API_IMAGE` and
`VERILIO_GATEWAY_IMAGE` remain repository-only values, without tags or digests.
The official D03/D04 contract excludes `latest`, floating `alpha`/`stable` tags, and `v0.1`/`v1`
aliases. D04 must not publish `main-<sha>` snapshots to the official release repositories;
private snapshots remain separate, local/source-based artifacts.

D04 publishing must require an explicit non-latest release version, a matching immutable Git
tag on the exact tagged source commit, clean source, and full official release qualification.
The existing official source/disposable-production release gate remains authoritative. D04
implements it in [publish-images.yml](../.github/workflows/publish-images.yml): exact tag checkout,
frozen install, development PostgreSQL health, migration/generation with clean-source verification,
lint/typecheck/unit/integration/E2E/deployment tests and build, then the existing build-release,
test-release and export-release scripts. Development PostgreSQL is cleaned up even on failure.
GHCR login uses only `GITHUB_TOKEN` and occurs after all qualification; the helper never builds
or logs in. Pre-gate local image IDs are checked again before tagging those exact objects.

[`publish-release-images.sh`](../deploy/publish-release-images.sh) accepts one explicit version,
consumes the D03 contract, and checks tagged clean canonical source plus local platform/OCI labels.
If both remote tags exist it refuses immutable republication; if one exists it reports partial
state for manual inspection. Registry/authentication uncertainty also fails before push. Only the
two exact release refs are pushed. After remote digest/config/OCI verification it logs out and
inspects both tags with an empty Docker credential configuration. Anonymous failure fails the job
with package-visibility guidance; no automatic visibility change or image deletion occurs. The
Actions summary records version, full source SHA, platform, refs, digests and each anonymous result.
A partial failed publication requires explicit operator recovery; retry never overwrites tags.

## 8.3 OCI Metadata Contract

Both official application images must contain:

```text
org.opencontainers.image.source=https://github.com/andresz74/verilio
org.opencontainers.image.version=<exact release tag>
org.opencontainers.image.revision=<full 40-char source SHA>
```

The existing [`deploy/Dockerfile`](../deploy/Dockerfile) already labels both API and Gateway
with version and revision (plus title), using `VERILIO_VERSION` and `VCS_REF` build arguments.
[`build-release.sh`](../deploy/build-release.sh) supplies the explicit version and full commit.
Reuse those existing labels; do not introduce a second version/revision metadata mechanism.
D04 adds the canonical source label to both runtime stages through this same LABEL mechanism.
Remote verification also compares the published manifest config digest with the tested local
image ID, preserving the build-once identity through publication.

## 8.4 Platform Contract

Initial official images target **`linux/amd64` only**. ARM64 and multi-architecture publishing
are not supported or claimed by this contract; evaluation remains D11/later work.

---

# 9. Compose Packaging Strategy

## Principle

Maintain **one canonical runtime definition** with minimal overrides/configuration rather than independent Compose stacks for every installation type.

The difference between source and prebuilt installs should primarily be the image source.

Conceptual configuration:

```text
VERILIO_API_IMAGE=<local or registry image repository>
VERILIO_GATEWAY_IMAGE=<local or registry image repository>
VERILIO_VERSION=<explicit immutable version>
```

D01 implemented repository variables in [`compose.prod.yml`](../compose.prod.yml):

```yaml
# migrate and api
image: ${VERILIO_API_IMAGE:-verilio-api}:${VERILIO_VERSION:?Set VERILIO_VERSION to an explicit release tag}
# gateway
image: ${VERILIO_GATEWAY_IMAGE:-verilio-gateway}:${VERILIO_VERSION:?Set VERILIO_VERSION to an explicit release tag}
```

The canonical environment template retains local defaults and an explicit version. D02 now
provides [`deploy/export-self-host-package.sh`](../deploy/export-self-host-package.sh):

```sh
./deploy/export-self-host-package.sh <explicit-version> <api-image-repository> <gateway-image-repository> [output-directory]
```

The generator writes `verilio-<version>-self-host/` under the output root (default `release/`),
containing the unchanged canonical runtime as `compose.yml`, a package-specific
`verilio.env.example`, concise `SELF_HOSTING.md`, and the init/smoke support scripts. Secret files
are not generated. Their relative paths resolve from the directory containing `compose.yml`;
`--env-file` resolves from the caller's working directory. D05 validated this same package and
canonical runtime using anonymous pulls of the official alpha.5 images on a clean Linux host.
Registry-backed provenance is outside D05; current release manifests and archive verification
still use local image identities.

---

# 10. Generic Fresh Install Experience

## Target User Story

A developer with a clean private Linux VM/server should be able to install Verilio without understanding the monorepo.

Future target experience (conceptual; the released registry package does not exist yet):

```sh
mkdir verilio
cd verilio
# obtain released self-host package
cp .env.example .env
# generate/configure required values
docker compose pull
docker compose up -d
```

A helper installer may reduce this further, but Compose must remain understandable without the helper.

## Required Installation Inputs

At minimum:

- gateway host port;
- stable owner UUID;
- database credentials/secrets;
- persistent database volume;
- explicit Verilio version.

## Required Installation Output

The user should be told:

```text
Verilio version
URL / host port
health status
data volume
backup location/instructions
first-use steps
private-network safety warning
```

---

# 11. First-Use Experience

Installation is complete when infrastructure is healthy, but the user still needs business data.

Documentation should lead directly to:

1. Open Verilio.
2. Open Settings.
3. Save Business profile.
4. Create a Client.
5. Create a Project.
6. Optionally create Tasks.
7. Start tracking time.

Seed data must remain optional and must never be required in production.

---

# 12. Configuration and Secrets

## Configuration

Non-secret runtime configuration may include:

- `VERILIO_API_IMAGE` and `VERILIO_GATEWAY_IMAGE` repository names;
- `VERILIO_VERSION` as the separate explicit tag;
- `VERILIO_GATEWAY_PORT`;
- `LOCAL_USER_ID`;
- log level;
- persistent-volume name;
- backup location/retention;
- secret-file paths.

## Secrets

Database passwords and connection credentials must not be:

- committed;
- baked into images;
- printed to normal logs;
- embedded in public Compose examples.

A generic install should either:

- generate secure secrets automatically; or
- clearly instruct the user how to create them.

The chosen approach must work in ordinary Docker Compose environments. Preserve file-backed
secret access for non-root containers and protected host directories as documented in docs/08.
`LOCAL_USER_ID` is recovery-critical and must survive upgrades/restores. Never put database
credentials in Vite/browser configuration. No public ingress is enabled automatically.

---

# 13. Persistence

The PostgreSQL database is the authoritative data store.

A self-host package must use a persistent volume or an explicitly documented durable host mount.

Normal operations must not delete the database volume:

- install/update;
- restart;
- image pull;
- Compose recreate;
- platform package update.

Platform wrappers must not hide destructive volume behavior behind a convenient UI action.

---

# 14. Migrations

The current migration model remains:

```text
PostgreSQL healthy
  ↓
one-shot migrate service
  ↓
API starts
  ↓
Gateway starts
```

Self-host packages must not require the user to manually run SQL migrations for routine upgrades.

Migration failures must prevent the new API from being declared ready.

Every release with schema changes must classify rollback compatibility. Checked-in Drizzle
migrations remain forward-only; already-applied migration history is not rewritten.

---

# 15. Backups and Restore

Easy installation is not enough; self-hosted ownership requires recoverability.

The package/runbook must keep clear guidance for:

- logical database backup;
- pre-upgrade backup;
- backup checksums;
- off-host copy recommendation;
- restore drill;
- total-host-loss recovery.

The generic package should avoid coupling backup logic to one hosting platform.

Platform-specific guides may explain where their users normally store/copy backups.

---

# 16. Upgrade Experience

## Prebuilt Installation

Target:

```text
verify backup
  ↓
select new explicit version
  ↓
docker compose pull
  ↓
docker compose up -d
  ↓
migrations
  ↓
health/smoke
```

A helper script may wrap this safely, but the underlying process must remain understandable.

## Source Installation

Continue supporting commit-addressed or tagged source builds with existing provenance rules.

## Alpha Version Policy

Breaking operational changes during alpha must be documented. Upgrades require backups and
explicit official package/image versions. Define a tested upgrade window before stable releases;
main snapshots remain separate from official release qualification.

## Upgrade Safety

An update must not silently:

- change `LOCAL_USER_ID`;
- replace database secrets;
- destroy the database volume;
- change host ingress configuration;
- expose new public ports;
- prune rollback images/backups automatically.

---

# 17. Rollback

Every install path must retain a documented rollback strategy.

## Compatible/Additive Schema Change

A prior image/release may be reselected while retaining forward-compatible database changes.

## Incompatible/Data-Changing Schema Change

Rollback requires preserving the upgraded volume and restoring the pre-upgrade backup into a safe recovery target.

Do not automate destructive down migrations.

---

# 18. Health and Observability

Minimum self-host verification:

```text
/health/live
/health/ready
```

A generic install should provide a simple command or UI-visible status for both.

Logs must remain available through normal container tooling:

```sh
docker compose logs
```

No large monitoring stack is required for basic self-hosted support.

---

# 19. Platform Targets

CasaOS / Portainer / Proxmox guidance → thin packaging layer → same canonical runtime.
These paths do not create separate application architectures.

## 19.1 Plain Linux + Docker Compose

This is the canonical target environment.

D05 validated the generated registry package on an isolated Ubuntu 24.04.5 LTS `linux/amd64` host
with its own Docker Engine and no source checkout. The existing private-alpha runbook remains
available; D06 generic install/update guidance is next. Measure resources on tested hosts rather
than promise universal hardware minimums; building source needs more headroom than running
prebuilt images.

## 19.2 Proxmox

Recommended architecture:

```text
Proxmox
  ↓
Debian/Ubuntu Linux VM
  ↓
Docker + Compose
  ↓
Verilio
```

Preferred eventual wording, only after the Docker-VM path is documented and verified:

> **Proxmox-friendly: run Verilio in a Docker VM.**

Do not market it as a native Proxmox application.

## 19.3 CasaOS

CasaOS is a planned thin package around the generic Docker/Compose distribution, not a
separate application architecture. Compatibility is not claimed yet.

Target work:

- compatible Compose definition;
- `x-casaos` metadata;
- app icon/description/screenshots if required;
- first install verification;
- upgrade verification;
- persistent storage verification.

Only after those pass may Verilio be described as CasaOS-compatible/installable.

## 19.4 Portainer

Portainer is a future verified Compose Stack deployment. Verify the canonical runtime with
documented environment/secrets handling before claiming compatibility.

## 19.5 Additional Homelab Platforms

Potential later targets:

- Unraid;
- TrueNAS SCALE;
- other Docker/NAS platforms.

Prioritize based on user demand rather than platform count.

---

# 20. Marketing Claims Policy

Distribution marketing must be evidence-based.

Allowed only after verification:

```text
Docker Compose supported
CasaOS compatible
Portainer compatible
Proxmox-friendly Docker VM deployment
```

Avoid claims such as:

```text
native Proxmox app
one-click CasaOS install
works on every NAS
production-ready public Internet app
```

These are not current claims. Public Internet readiness always additionally requires the public
authentication/session/authorization boundary; platform packaging cannot establish it.

Preferred broad positioning after generic Docker distribution is proven:

> **Self-host Verilio anywhere you run Docker.**

with a clear private-network/authentication caveat while fixed-owner mode remains in place.

---

# 21. Release Channels

Keep two concepts distinct.

## Private Snapshot

Example:

```text
main-ba4bf2a06f04
```

Purpose:

- dogfooding;
- testing current `main`;
- private developer deployments.

Not an official release.

## Official Release

First successfully published GHCR release:

```text
v0.1.1-alpha.5
```

Purpose:

- release qualification;
- currently: checksummed exported image archives, deployment bundles, and published GHCR images;
- validated: D02-generated self-host package with alpha.5 images on a clean Ubuntu 24.04.5 LTS host;
- planned: D06 generic install/update guidance and validated platform packages.

Official self-host distribution should be based on official releases, not arbitrary `main` snapshots.

---

# 22. Execution Phases

## D1 — Canonical Generic Container Contract

**Status:** In progress; D01 and D02 complete. D05 has verified anonymous registry pull and the
clean-host runtime for the initial `linux/amd64` release. Registry-backed provenance remains
outside D05; existing archive provenance is unchanged.

Deliver:

- configurable application image references
- no unnecessary host-specific assumptions
- source snapshot compatibility
- tests for local/registry image source

D01 proves repository interpolation with local defaults and custom repository strings; it does
not prove registry pulls, registry-backed provenance, or a clean-host registry installation.

## D2 — Official Image Publishing

**Status:** Complete for the initial `linux/amd64` official publishing path. D03 defined the
contract; D04 successfully published the exact tested images for `v0.1.1-alpha.5` using immutable
tags, verified OCI metadata, and verified anonymous access. D05 clean-host installation has also
passed on Ubuntu 24.04.5 LTS; this does not establish platform, ARM64/multi-architecture, or public
Internet support.

Deliver:

- registry namespace decision
- release image publishing
- immutable version tags
- source/version metadata
- pull verification

## D3 — Generic Self-Hosted Release Bundle

**Status:** In progress; D02 package shape and D05 clean-host validation complete. D06 generic
install/update and backup/rollback documentation remains planned.

Deliver:

- Compose package
- environment template
- secret/bootstrap process
- install/update docs
- backup/rollback guidance
- clean-host install verification

## D4 — Platform Compatibility

**Status:** Planned.

Order:

1. CasaOS
2. Portainer
3. Proxmox Docker VM
4. additional platforms based on demand

## D5 — Fresh Source-Based Installer

**Status:** Planned.

Deliver:

- one supported source installation command
- prerequisite checks
- safe config/secrets
- exact source identity
- canonical runtime
- health/rollback output

## D6 — Hardening

**Status:** Possible later work; not complete.

Possible later work:

- SBOM
- signing/attestation
- additional architectures
- install CI
- upgrade matrix

---

# 23. Suggested GitHub Issue Sequence

```text
D01  Parameterize Verilio API/Gateway image repositories
D02  Add prebuilt-image Compose mode/package
D03  Define GHCR image/version naming contract
D04  Publish tagged release images to GHCR
D05  Verify clean-host install from published images
D06  Add generic self-host install/update documentation
D07  Add CasaOS app package and test it
D08  Verify/document Portainer Stack installation
D09  Verify/document Proxmox Docker-VM installation
D10  Add fresh source-based private installer
D11  Evaluate SBOM/signing and multi-arch publishing
```

**D01 — COMPLETE:** [issue #23](https://github.com/andresz74/verilio/issues/23) /
[PR #24](https://github.com/andresz74/verilio/pull/24), merged 2026-10-04.
**D02 — COMPLETE:** [issue #27](https://github.com/andresz74/verilio/issues/27) /
[PR #28](https://github.com/andresz74/verilio/pull/28). The package generator copies canonical Compose, writes explicit
repository/version configuration with portable secret paths, and includes runtime support files.
No images or secrets are generated; no registry is contacted.

**D03 — COMPLETE:** [issue #29](https://github.com/andresz74/verilio/issues/29) /
[PR #30](https://github.com/andresz74/verilio/pull/30). The official repositories are
`ghcr.io/andresz74/verilio-api` and
`ghcr.io/andresz74/verilio-gateway`, with exact immutable Git release tags and `linux/amd64` only.
The non-secret contract is [`deploy/official-images.env`](../deploy/official-images.env).
OCI source/version/full-revision requirements and public/anonymous-pull intent are documented;
the first official images were published and anonymously verified under D04 below.

**D04 — COMPLETE:** Implementation: [issue #31](https://github.com/andresz74/verilio/issues/31) /
[PR #32](https://github.com/andresz74/verilio/pull/32). First operational publication validation:
[issue #33](https://github.com/andresz74/verilio/issues/33),
[workflow run 37318991060](https://github.com/andresz74/verilio/actions/runs/37318991060).
The qualification workflow published the same tested local image objects using immutable release
tags, verified OCI source/version/revision metadata and digests, and verified anonymous access.

- Release: `v0.1.1-alpha.5`.
- Source commit: `db222d2446a1f12b5e29059665a6db7f2b4d1783`.
- Platform: `linux/amd64`.
- API: `ghcr.io/andresz74/verilio-api:v0.1.1-alpha.5`.
- API digest: `sha256:9d76436b4dd86cbca0b8a53cfe42be7554878b7e98d69298cee568364e1450e6`.
- Anonymous API verification: **passed**.
- Gateway: `ghcr.io/andresz74/verilio-gateway:v0.1.1-alpha.5`.
- Gateway digest: `sha256:dcb455a392453ac5e6514bb6a1047095df49612263e25cbe9724494ef21fceb8`.
- Anonymous Gateway verification: **passed**.

`v0.1.1-alpha.4` remains an untouched failed pre-publication qualification attempt, not a
published image release.

**D05 — COMPLETE:** [issue #39](https://github.com/andresz74/verilio/issues/39), validated
2026-10-05 on a fresh isolated OrbStack Ubuntu 24.04.5 LTS `linux/amd64` host, with host file
sharing disabled and its own Docker Engine 29.1.3 / Compose 2.40.3. Only the generated D02
package was transferred; no source checkout, local images, credentials, or build output was
transferred. Node/pnpm were absent; Git was installed as a Docker package dependency but unused.

- Release: `v0.1.1-alpha.5`; image source: `db222d2446a1f12b5e29059665a6db7f2b4d1783`.
- API: `ghcr.io/andresz74/verilio-api:v0.1.1-alpha.5`.
- API RepoDigest: `ghcr.io/andresz74/verilio-api@sha256:9d76436b4dd86cbca0b8a53cfe42be7554878b7e98d69298cee568364e1450e6`.
- Gateway: `ghcr.io/andresz74/verilio-gateway:v0.1.1-alpha.5`.
- Gateway RepoDigest: `ghcr.io/andresz74/verilio-gateway@sha256:dcb455a392453ac5e6514bb6a1047095df49612263e25cbe9724494ef21fceb8`.
- Both images were absent before anonymous Compose pull with an empty Docker credential config;
  pulled digests matched D04 exactly. Canonical Compose config contained no builds and retained
  `postgres:17.9-alpine`.
- PostgreSQL bootstrap/health, migration (exit 0), API/Gateway health, and packaged SPA/deep-route/
  live/ready/database-connected smoke checks passed before and after full container recreation.
- Only Gateway published a host port, at `127.0.0.1:8080`; API/PostgreSQL published none.
- Business Settings `Verilio D05 Validation 2026-10-05T19:45:21Z`, saved through the public API,
  survived recreation with the same `verilio_pgdata` volume and stable server owner UUID.
- No source build/toolchain or GHCR login was used. The disposable stack, volume, and host were
  removed after evidence capture; NC110 and existing installations were untouched.

D05 is complete; D06 generic install/update documentation is next and remains planned.
D06–D11 are not complete. This single-host validation does not establish CasaOS, Portainer,
Proxmox, ARM64/multi-architecture, upgrade/restore qualification, or public Internet readiness.

D02 consumes the canonical runtime, not a second production Compose stack. D03 establishes
registry identity and release eligibility before D04 publishing. Each slice uses one issue,
one branch, and one PR.

Do not combine platform packages before the generic distribution is stable.

---

# 24. Validation Strategy

## Unit/Script Tests

Cover:

- environment parsing;
- version validation;
- generated config;
- image-reference selection;
- upgrade preservation;
- failure before mutation;
- idempotent setup where applicable.

## Docker Integration Tests

From a clean temporary environment verify:

- database bootstrap;
- migrations;
- API health;
- gateway health;
- SPA route;
- persistence after restart;
- backup;
- restore where practical.

## Clean-Host Acceptance Test

Before calling the generic installer/release bundle easy to self-host, test on a clean supported Linux VM with only the documented prerequisites.

## Platform Acceptance Tests

For each named platform:

- fresh install;
- restart;
- upgrade;
- data persistence;
- health;
- removal behavior/documented volume safety.

---

# 25. Distribution Definition of Done

Generic distribution is ready when a new technically competent user can, using only documented
prerequisites on a clean supported private Linux Docker host:

1. Understand the private-network security boundary and select an explicit released version.
2. Obtain the released Compose package, configure protected secrets and a stable server owner,
   and verify/pull official images without source build tools.
3. Start the canonical runtime with successful bootstrap, migrations, live/ready checks, and SPA.
4. Complete Settings → Business profile → Client → Project → optional Tasks → time tracking.
5. Restart without data loss and upgrade without changing owner, secrets, volume, or private ingress.
6. Create/check a backup, perform a restore drill, and follow schema-aware rollback or host-loss recovery.
7. Inspect version/source/image identity and logs without exposing credentials.

Source installs must converge on the same runtime with exact source identity. Each marketed
platform must separately pass fresh install, persistence, restart, upgrade, health, and removal
safety validation. Only `linux/amd64` is initially targeted; additional architectures require tests.
D01 completion alone does not meet this definition of done.

README stays concise and links to canonical plans/runbooks. Current procedures remain in docs/08;
future generic and platform guides must clearly label what is implemented and what is planned.
Platform guides contain only differences from the canonical path, not independent runtimes.

---

# 26. Final Principle

**One Verilio runtime, two installation models, multiple thin platform packages.**

Simple installation must preserve explicit immutable versions, PostgreSQL persistence,
understandable upgrades, recoverable backups, and private-by-default exposure. Package the
existing application without changing its domain architecture or implying that public
authentication has been solved.
