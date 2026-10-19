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
