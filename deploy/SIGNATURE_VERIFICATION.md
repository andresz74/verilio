# D11.2 — digest-bound image signatures

**Implementation prepared; official signing is disabled.** No Verilio release is
qualified as signed by this work. The disposable GHCR/OIDC experiment, native
paired-image portable verification, and first required release/cutover remain
owner-authorized activation gates. `v0.1.1-alpha.5` remains legacy unsigned.

## Release and trust boundary

The invariant remains: build once → qualify exact images → publish unchanged →
verify remote identity → sign immutable manifest digests → verify both signatures.
Only the API and Gateway official repositories, exact release versions and
`linux/amd64` are accepted. Attaching metadata does not change their manifests,
config digests or runtime layers. No signature verification happens automatically
inside Docker Compose, and a successful pull does not verify a signature.

Signatures authenticate an approved workflow's authorization of exact bytes and
release claims. They do not independently establish honest qualification, complete
SBOM coverage, absence of vulnerabilities, reproducible builds, or safe application
code. An authorized compromised workflow/runner remains in the trust boundary.
SBOM and qualification attestations are D11.3, not implemented here.

## Tools and trust material

`signing/toolchain.json` pins Cosign v3.1.3, the Linux amd64 executable checksum,
a Darwin amd64 executable checksum for local verification, policy checksum,
production Sigstore trusted-root snapshot and signing configuration checksums.
Consumer tooling availability is not an additional Verilio runtime platform claim.

The upstream checksum list was **independently verified on 2026-10-19 using
sigstore-python 4.0.0**, with its packaged production trust material in offline
mode. Verification checked the certificate, signature and transparency material:

```text
identity: keyless@projectsigstore.iam.gserviceaccount.com
issuer: https://accounts.google.com
```

This is the upstream Cosign distribution identity, **not** Verilio's GitHub signer.
The Linux binary's SHA-256 matched the authenticated checksum list:

```text
4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71
```

The checksum list and original bundle are small public test fixtures under
`tests/fixtures/signing/`. A second Cosign verification passed. The Python verifier's
online TUF refresh encountered a local TLS CA-chain error; certificate verification
was not disabled. Its separately packaged production trust material successfully
verified the release offline. The vendored roots/config originate from that pinned
package, not from candidate image evidence. Trust in this bootstrap includes the
Python/PyPI distribution channel, independently of the downloaded Cosign binary.

Sources: [Cosign v3.1.3](https://github.com/sigstore/cosign/releases/tag/v3.1.3),
[versioned release build](https://github.com/sigstore/cosign/blob/v3.1.3/release/cloudbuild.yaml),
[Sigstore Python 4.0.0](https://pypi.org/project/sigstore/4.0.0/).

Tool/root/config upgrades require reviewed pins, independent upstream authentication,
cryptographic regression tests, and renewed compatibility tests. Preserve historical
verification keys needed by accepted releases. Do not replace trust roots with files
chosen by an untrusted portable bundle. Offline users must obtain policy/root updates
through a trusted channel; offline verification cannot discover new incidents.

## Versioned signer and consumer policy

`signing/policy.json` v1 is shared by signer and verifier. The issuer is exactly
`https://token.actions.githubusercontent.com`. The only authorized workflow is
`andresz74/verilio/.github/workflows/publish-images.yml`:

| Event | Exact certificate identity suffix | Required invocation ref |
| --- | --- | --- |
| `push` | `@refs/tags/<exact-version>` | `refs/tags/<exact-version>` |
| `workflow_dispatch` | `@refs/heads/main` | `refs/heads/main` |

The full identity begins `https://github.com/`. Other dispatch branches, workflows,
repositories and issuers fail. No repository-wide wildcard is accepted.

The invocation SHA, workflow-definition SHA, selected application SHA and manifest
digest are separate. A dispatch from main may select an older application tag.
The signing job independently resolves that tag through GitHub and checks its commit.
`--certificate-github-workflow-sha` verifies the certificate's OIDC `sha` claim,
**not** an independently certified workflow-definition SHA. Workflow-definition SHA
is recorded as a signed workflow assertion and compared across the pair; this does
not add an unimplemented generic Fulcio-extension verification claim.

Signatures carry exactly these v1 annotation names:

```text
verilio.policy       verilio.repository   verilio.version
verilio.source       verilio.platform     verilio.api
verilio.gateway      verilio.event        verilio.ref
verilio.invocation   verilio.workflow
```

Both signatures bind the same source/version/platform/pair and signing context;
`verilio.repository` identifies each exact official repository. Copying signed bytes
to another repository does not authorize that repository. One complete acceptable
signature must satisfy the entire policy; claims are never assembled from multiple
signatures. Multiple native signature bundles currently refuse for manual review.

Policy versions describe signing eras. A future workflow migration must deliberately
retain reviewed historical policy/identities, rather than replacing the current path
and assuming old certificates remain authorized. V1 adds no speculative historical
identities. The verifier selects an older signed policy version only through an
explicit `historical_contexts` record containing its exact workflow, contexts,
release-version allowlist and revocation flag. Those records are consumer-only;
the signer always uses the current policy. Tests use synthetic historical records,
not additional production identities. Denied release versions, sources and invocation commits permit explicit
incident exclusions. Changes require a trusted policy/verifier release and updated
pins/tests; candidate bundles cannot authorize policy changes. Older verifier copies
cannot know a new revocation/deny policy until updated. Transparency entries cannot
be erased as incident rollback.

## Isolated workflow and default-off activation

The existing publishing job retains its permissions and complete D11.1 gates.
The new `sign` job needs successful publication **including final evidence upload**,
but its job condition is deliberately literal `false`. The policy separately has
`official_signing_enabled: false`. There is no dispatch input or repository-variable
bypass. Merging this code cannot activate signing.

Future activation requires an owner-reviewed code/policy/test change after the
separately authorized experiment passes, plus an explicit first-required release.
Do not activate by changing just one guard.

Only the isolated job has `id-token: write`; it also uses `contents: read`,
`packages: write`, and `actions: read` for exact artifact metadata/download. No PAT,
private signing key or long-lived signing secret is introduced. The existing GitHub
token authorizes only registry metadata attachment in this job.

Helpers are checked out at `github.workflow_sha`, never extracted as executable
artifact content and never selected implicitly from the application release tag.
Two exact artifact IDs come from producer step outputs. The receiver checks the
same run, attempt-qualified names, invocation SHA, expiration and size; rejects
unexpected names, traversal, duplicate entries and symlinks; and bounds extraction.
It strips GitHub authorization before following the signed artifact download URL.

`release-evidence.mjs validate-publication <directory>` is read-only, validates the
original qualification → evidence → publication checksum chain and both successful
anonymous manifest/config mappings, and requires no local Docker images. It does
not weaken the pre-publication `validate` command. Unsigned receipts remain CI
consistency evidence, not independent proof of qualification.

The signing helper then independently rechecks application tag/source and both
remote manifests/configs/labels, qualified config IDs, exact tag mappings and
anonymous access before issuing either signature. It never calls build, publisher,
retag, SBOM generation or image cleanup helpers.

## Consumer interface — operational qualification pending

Distribute the verifier together with its sibling `signing/` directory through a
trusted channel. No published downloadable verifier package is claimed here.
Required verification utilities: Python 3.9+ standard library and the pinned Cosign
executable. GitHub login, Node, pnpm, Git checkout and a Docker daemon are unnecessary.
Current CLI uses Python 3.9+ `Path`/string APIs; Linux amd64 is the initial CI target.

Obtain expected version, full application source SHA and **both manifest digests**
from independently trusted release information. Do not let candidate evidence choose
all expected values. Once future signed releases are qualified, the interface is:

```bash
./deploy/verify-release-signatures.sh \
  --version vX.Y.Z \
  --source-commit <trusted-full-source-SHA> \
  --api-digest sha256:<trusted-api-manifest-digest> \
  --gateway-digest sha256:<trusted-gateway-manifest-digest> \
  --cosign /absolute/path/to/pinned/cosign \
  --output-dir /new/private/verification-directory
```

The implementation requests public GHCR tokens, manifests, configs and native
referrers without using Docker credentials or GitHub tokens. It validates every
referenced digest, tag mapping, OCI source/version/revision label and platform,
then invokes pinned Cosign for each complete native bundle and certificate policy.
There is no legacy-format or unsigned fallback. Network, missing-evidence and
identity failures return nonzero; neither image is reported as a verified pair.

**Anonymous native GHCR discovery and this full paired-image path have not been
operationally validated.** These examples describe implemented interfaces, not an
assertion that a signed Verilio release is available.

## Portable evidence and offline mode

Successful collection preserves exact original `api.sigstore.json` and
`gateway.sigstore.json`, exact manifest/config bytes, and a `verification.json`
record with checksums and trusted policy/root/toolchain identities. Portable files
never establish their own trusted roots. The verifier checks the original bytes
and repeats signature, certificate, SCT/transparency, subject and release checks.

```bash
./deploy/verify-release-signatures.sh \
  --version vX.Y.Z \
  --source-commit <trusted-full-source-SHA> \
  --api-digest sha256:<trusted-api-manifest-digest> \
  --gateway-digest sha256:<trusted-gateway-manifest-digest> \
  --cosign /absolute/path/to/pinned/cosign \
  --bundle-dir /previously-exported/verification-directory
```

The portable path makes no registry requests and uses explicit local roots and an
empty verification HOME/configuration. It uses Cosign v3.1.3's supported
`verify-blob-attestation --bundle ... --trusted-root ... --digest ... --digestAlg sha256`
with the built-in `https://sigstore.dev/cosign/sign/v1` image-signature statement.
Cosign v3's native image signing internally uses this envelope; no custom D11.3
predicate is introduced. Image `cosign verify --bundle` is not a supported interface.
Neither `--check-claims=false` nor transparency/SCT bypasses are used. Merely passing
`--offline` is not proof of an airgapped verifier.

Eight actual cryptographic distribution-fixture checks passed with the pinned Linux
binary in a disposable **network-disabled, read-only container**: valid signature,
wrong identity/issuer/bytes, absent roots, tampered signature, missing transparency,
and missing required GitHub certificate extension. These demonstrate offline tool
verification of the upstream fixture, **not** full Verilio native image-bundle or
paired portable-mode qualification. That complete network-denied acceptance remains
an activation blocker and must be demonstrated in the approved experiment.

## Failures, retention and recovery

Stages are deliberately separate:

1. Legacy unsigned (including alpha.5).
2. Published, required signatures missing.
3. Signatures attached, verification incomplete.
4. Both signatures consumer-verified; required evidence delivery successful.

No first required release is selected. Both components must pass before the pair
is fully accepted. Application images may remain runnable after signing fails;
this does not make them a fully verified signed release.

`attempt-status.json` persists component progress before external signing calls.
An interrupted call remains `attempted-unknown`; a failure preserves valid prior
bundles and records incomplete/review-required status. Atomic status updates use
unique temporary siblings; stale interrupted temporary files are not trusted or
uploaded. Each attempt requires a fresh output directory. No implicit resume exists.
`signing.json` is immutable and links publication/portable checksums only after
paired verification; artifact delivery remains separately pending until CI confirms
upload. An upload failure leaves evidence acceptance incomplete.

Artifacts use an explicit allowlist and 30-day retention, subject to repository
settings. They exclude raw subprocess diagnostics, credentials, temporary files
and private keys. Actions artifacts require GitHub access and expire. Anonymous
consumer access is intended through GHCR; no durable public download service or
Release asset publication is introduced here.

Tool/OIDC/Fulcio/Rekor failure prevents accepted signatures. API-only success,
attachment/verification mismatch, missing anonymous discovery, conflicting existing
signatures and artifact failures all require review. No retry deletes transparency
entries or modifies images. The publisher still refuses existing/partially-existing
immutable tags: **a full workflow rerun is not metadata recovery**. A future separately
approved recovery procedure must revalidate original evidence and current digest/tag
mappings before touching metadata. There is no automatically callable signing-only
recovery workflow in this slice.

## Tests and remaining activation gates

Normal `pnpm test:deploy` runs daemon/network-free receipt, policy, mocked signing,
artifact and workflow contracts. Mocks are not cryptographic evidence.

Explicit real distribution verification (no signing):

```bash
bash deploy/tests/release-signatures-crypto.test.sh /absolute/path/to/pinned/cosign
```

Before activation, separately authorize and complete a disposable non-official GHCR
package/OIDC experiment: native attachment/discovery, both production context models,
wrong identity/digest/repository rejection, exact manifest immutability, portable
bundle export, and complete paired verification with networking denied. A test
identity is never added implicitly to production policy. Storage incompatibility
requires owner review, not silent format fallback. First official release operation
and cutover require further authorization. D11.3–D11.6 remain unimplemented.
