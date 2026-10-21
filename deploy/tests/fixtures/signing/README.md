# Public upstream cryptographic fixtures

Original Cosign v3.1.3 assets (unchanged):

- https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign_checksums.txt
- https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign_checksums.txt.sigstore.json

Identity: `keyless@projectsigstore.iam.gserviceaccount.com`.
Issuer: `https://accounts.google.com`.

These are publicly issued certificate/signature/transparency data, not secrets.
The fixtures authenticate the tool distribution; they are not Verilio image
signatures or D11.3 attestations. Original byte checksums and authentication
procedure are recorded in `deploy/signing/toolchain.json` and
`deploy/SIGNATURE_VERIFICATION.md`.

Additional unchanged Syft v1.54.1 public release assets exercise actual GitHub
certificate extensions, using the already-pinned D11.1 scanner release:

- https://github.com/anchore/syft/releases/download/v1.54.1/syft_1.54.1_checksums.txt
- https://github.com/anchore/syft/releases/download/v1.54.1/syft_1.54.1_checksums.txt.sigstore.json

Expected identity: `https://github.com/anchore/syft/.github/workflows/release.yaml@refs/heads/main`.
Issuer: `https://token.actions.githubusercontent.com`.
Repository: `anchore/syft`; trigger: `workflow_dispatch`; ref: `refs/heads/main`.
Invocation SHA: `b254e6d92f28c3868a755f62fb3ca8f26e9fee76`.

These assertions are checked against the cryptographically verified certificate;
this public upstream identity is never added to Verilio's production policy.
Both fixture families are distribution blob signatures, not native image signatures.
