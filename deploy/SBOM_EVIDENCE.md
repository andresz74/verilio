# Exact tested-image SBOM evidence (D11.1)

D11.1 adds unsigned SPDX 2.3 JSON evidence for future official `linux/amd64`
API/Gateway releases. It does not retrofit evidence onto `v0.1.1-alpha.5`, sign
images, establish independently attested builds, qualify ARM64, or establish
reproducible Docker builds. D11.2–D11.6 remain separate work.

## Release boundary

The official workflow remains:

1. Validate the exact Git tag and full source commit; run the complete source gate.
2. Build each image once and immediately capture both Docker image IDs.
3. Run the full disposable release gate with `--expected-images candidate.json`.
   API, migrate and Gateway container `.Image` values must match. Tag identities
   are checked before/after the gate, including its unchanged backup/restore path.
4. Export the existing amd64 archive and recheck identities; issue qualification.
5. Verify pinned Syft, scan both immutable IDs, validate evidence and upload it.
6. Revalidate evidence before GHCR authentication. Publish unchanged objects using
   the explicit `--evidence-dir` interface, then verify identities anonymously.
7. Issue/upload the final publication receipt.

Legacy one-argument release-test and publisher callers remain supported. The
workflow's strict evidence path cannot be satisfied by the publisher's optional
qualified-ID environment variables alone. No new build occurs after qualification.
Outputs live under `RUNNER_TEMP`, outside the clean release checkout.

## Scanner and schema pins

`sbom/toolchain.json` pins Syft 1.54.1's official Linux amd64 archive and executable,
configuration, explicit catalogers, `squashed` scope, SPDX 2.3 encoder and official
SPDX schema. `sbom/syft.yaml` disables update checks and network enrichment.
The generator uses a local Unix Docker context, a separate empty configuration/home,
and an allowlisted environment. There is no registry or mutable-tag scan fallback.

The release archive checksum was authenticated on 2026-10-19 using its upstream
Sigstore bundle, expected certificate identity:

```text
https://github.com/anchore/syft/.github/workflows/release.yaml@refs/heads/main
issuer: https://token.actions.githubusercontent.com
```

Verification returned `Verified OK` with upstream Cosign 3.1.3. This was verification
of the scanner distribution only, not Verilio signing functionality or permissions.
The signed checksum matched GitHub's release-asset digest and the downloaded archive;
the extracted executable checksum is separately pinned. Upstream material:

- https://github.com/anchore/syft/releases/tag/v1.54.1
- `syft_1.54.1_checksums.txt.sigstore.json`
- SPDX schema revision `aadf3b0b8dbbabdb4d880b0fc714255fea436ff7`:
  https://github.com/spdx/spdx-spec/blob/aadf3b0b8dbbabdb4d880b0fc714255fea436ff7/schemas/spdx-schema.json

The schema is vendored unchanged. The small Node validator implements every validation
keyword used by that pinned schema and rejects unknown keywords. Additional semantic
checks enforce relationships, IDs, scanner identity, image subject and coverage.
There are no added production dependency inputs or validator npm dependencies.

Scanner upgrades require a reviewed release/distribution verification, updated archive
and executable pins, cataloger/configuration review, schema-keyword review, and offline
plus real-image coverage checks. Do not use a floating installation script or checksum
from an unauthenticated neighboring file as the sole trust anchor.

## Generate evidence

Only the official workflow may assert official qualification. For a qualified run:

```sh
node deploy/release-evidence.mjs install-scanner "$RUNNER_TEMP/verilio-syft"
./deploy/generate-release-sbom.sh \
  --qualification "$RUNNER_TEMP/verilio-sbom/qualification.json" \
  --output-dir "$RUNNER_TEMP/verilio-evidence" \
  --syft "$RUNNER_TEMP/verilio-syft/syft"
```

The output directory must not exist. Both images are required. The helper verifies
scanner bytes/version/configuration, local IDs, labels and source/platform/version.
Each scan is limited to 600 seconds, two cataloger workers and 100 MiB output files.
These are failure bounds, not measured hardware requirements. Private raw diagnostics
and native scanner metadata remain outside the artifact allowlist.

## Coverage and identity

API coverage requires Debian packages, Node 24.1.0 and representative installed
production packages: Fastify 5.12.1, pg 8.23.0 and @react-pdf/renderer 4.9.0. The latter
two exercise workspace-transitive pnpm deployment paths. Coverage versions are checked
against the resolved lockfile and must be reviewed when dependencies change.

Gateway coverage requires Alpine musl and Caddy's Go-module identity/version. Compiled
frontend assets lack ordinary package manifests/node_modules: **this is not a complete
shipped-web-dependency inventory**. Discovering Caddy/Alpine does not establish discovery
of bundled React. A separate future build-input inventory would not prove every lockfile
entry shipped. No supplementary inventory is mandatory in this slice.

Three different digests must not be confused:

- The qualified Docker image ID is the **config digest**.
- Syft's SPDX root checksum identifies its **local manifest representation**. Native
  metadata must identify the requested config ID and exact input; `*.scan.json` retains
  only the checked mapping and original SBOM checksum. This local manifest digest is
  not asserted to equal a registry manifest digest.
- After publication, inspect `repository@manifest-digest`, verify its config digest
  against the qualified ID, validate labels/platform, recheck the tag, and repeat with
  empty credentials. Only that verified **remote manifest digest** enters publication
  evidence.

## Records and byte integrity

All successful receipts use `verilio.release-evidence/v1` and keep workflow-definition
identity separate from the selected application source SHA:

| File | Meaning |
| --- | --- |
| `qualification.json` | Both candidate IDs passed the complete gate; exact version/source/platform/run |
| `api.spdx.json`, `gateway.spdx.json` | Original validated SPDX 2.3 bytes |
| `api.scan.json`, `gateway.scan.json` | Minimal scanner config-ID/local-manifest/SBOM mapping |
| `checksums.txt` | SHA-256 of original SPDX files |
| `evidence.json` | Qualification checksum, paired SBOM and mapping checksums, tool/config/coverage pins and limitation |
| `publication.json` | Evidence checksum and paired verified remote manifest/config mappings, exact refs and anonymity |
| `attempt-status.json` | Diagnostic progress/failure only; not successful qualification/publication evidence |

Accepted receipts are atomically created without overwrite. SBOMs are never rewritten
to add publication metadata. Pre-publication evidence contains no invented remote digest.
Repeated scans can differ in timestamps/namespaces; byte reproducibility is not promised.
Unsigned checksums/receipts establish consistency, **not independent publisher authenticity**.
The trust boundary includes the approved workflow, runner, scanner and Docker daemon.

D11.2 adds a read-only `validate-publication` boundary and default-off signing/
consumer-verification infrastructure; it does not sign these receipts or attest
qualification/SBOM claims. Official signing remains disabled pending the separately
authorized GHCR/OIDC experiment and owner activation. See
[signature verification](SIGNATURE_VERIFICATION.md). Existing alpha.5 is not
retroactively signed and D11.3–D11.6 remain unimplemented.

## Retention, failures and retries

The workflow must successfully upload pre-publication evidence before registry login.
Artifacts use release/platform/run/attempt/stage names and explicit **30-day retention**,
subject to repository policy. Downloads require GitHub sign-in and repository read access;
these are expiring CI artifacts, not durable anonymous SBOM distribution.

Only allowlisted validated SBOMs, mappings, receipts and checksums are uploaded. Scanner
raw logs, native metadata, temporary directories and Docker credentials are excluded.

Before login, missing qualification, drift, scanner/tool failure, invalid SPDX, insufficient
coverage, sensitive content, checksum failure or required upload failure blocks publication.
If Gateway scanning fails, an already-validated API SBOM may be retained, but no paired
success receipt is issued. Raw rejected documents remain private, not artifact inputs.

Once a push starts, failure can leave unknown or partial registry state. The status record
distinguishes attempted, accepted/unverified and anonymously verified components. Both-existing
or partially-existing official tags still refuse publication. An error never authorizes
rebuild, overwrite, tag retargeting, deletion, visibility mutation or blind workflow rerun.

A final receipt/upload failure means images may be published while evidence finalization
is incomplete. Preserve the original evidence and inspect the registry manually. Metadata-only
recovery, signing/attestation, durable registry evidence and multi-architecture support require
separately reviewed work. Do not rerun the full publisher as an evidence-recovery mechanism.

## Validation boundary

Normal tests are offline and mock Docker/scanner/registry operations. Real-image coverage
uses disposable scanner containers and read-only local image access. Neither substitutes
for the complete official qualification gate. The first future authorized publication
must verify actual Actions uploads, remote digest/config mapping and anonymous access;
no real official publication is performed as part of this PR's local validation.

Local coverage verification on 2026-10-19 used Syft's pinned Linux amd64 executable
in disposable, network-disabled scanner containers. Separate local fixture images
were derived from already-present API/Gateway images without changing the originals.
The API retained its real pnpm production deployment tree: Debian libc6, Node 24.1.0,
Fastify 5.12.1, pg 8.23.0 and @react-pdf/renderer 4.9.0 passed schema, containment and
version assertions. The Gateway fixture added React's production JavaScript as a
static bundle without its package manifest: Alpine/Caddy passed, while React was
not identified. This demonstrates the documented limitation. These were scanner
coverage tests, not official release qualification or publication.
