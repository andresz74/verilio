#!/usr/bin/env bash
# Explicit opt-in, real verification of upstream distribution fixtures only.
# No signing, registry access, network requirement, keys or Verilio publication.
set -euo pipefail
binary=${1:?absolute pinned Cosign executable required}
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
work=$(mktemp -d "${TMPDIR:-/tmp}/verilio-crypto-test.XXXXXX")
trap 'rm -rf "$work"' EXIT
export HOME="$work" DOCKER_CONFIG="$work"
unset COSIGN_REPOSITORY COSIGN_EXPERIMENTAL SIGSTORE_ROOT_FILE SIGSTORE_REKOR_PUBLIC_KEY || true
node - "$binary" "$root/deploy/signing/toolchain.json" <<'JS'
const fs=require('fs'),crypto=require('crypto');
const sum=crypto.createHash('sha256').update(fs.readFileSync(process.argv[2])).digest('hex');
if(!Object.values(JSON.parse(fs.readFileSync(process.argv[3])).executable_sha256).includes(sum))process.exit(1);
JS
fixture="$root/deploy/tests/fixtures/signing"
base=("$binary" verify-blob --trusted-root "$root/deploy/signing/trusted-root.json" --bundle "$fixture/cosign_checksums.txt.sigstore.json" --certificate-identity keyless@projectsigstore.iam.gserviceaccount.com --certificate-oidc-issuer https://accounts.google.com)
passed=0
ok() { passed=$((passed+1)); printf 'ok %s - %s\n' "$passed" "$1"; }
reject() { if "$@" >"$work/out" 2>&1; then echo 'Unexpected cryptographic acceptance' >&2; exit 1; fi; }
"${base[@]}" "$fixture/cosign_checksums.txt" >"$work/out" 2>&1
ok 'real certificate, signature, SCT and transparency validation with pinned roots'
reject "${base[@]}" --certificate-identity wrong@example.com "$fixture/cosign_checksums.txt"
ok 'wrong identity rejected cryptographically'
reject "${base[@]}" --certificate-oidc-issuer https://token.actions.githubusercontent.com "$fixture/cosign_checksums.txt"
ok 'wrong issuer rejected cryptographically'
printf 'tampered\n' >"$work/tampered"
reject "${base[@]}" "$work/tampered"
ok 'wrong signed bytes rejected cryptographically'
reject "${base[@]}" --trusted-root "$work/missing-root" "$fixture/cosign_checksums.txt"
ok 'missing explicit roots refused'
node - "$fixture/cosign_checksums.txt.sigstore.json" "$work" <<'JS'
const fs=require('fs');const b=JSON.parse(fs.readFileSync(process.argv[2]));
const bad=structuredClone(b);bad.messageSignature.signature='AAAA';
fs.writeFileSync(process.argv[3]+'/tampered-bundle.json',JSON.stringify(bad));
b.verificationMaterial.tlogEntries=[];
fs.writeFileSync(process.argv[3]+'/no-transparency.json',JSON.stringify(b));
JS
reject "${base[@]}" --bundle "$work/tampered-bundle.json" "$fixture/cosign_checksums.txt"
ok 'tampered signature refused cryptographically'
reject "${base[@]}" --bundle "$work/no-transparency.json" "$fixture/cosign_checksums.txt"
ok 'missing transparency refused cryptographically'
reject "${base[@]}" --certificate-github-workflow-repository andresz74/verilio "$fixture/cosign_checksums.txt"
ok 'absent required GitHub certificate extension rejected cryptographically'
github=("$binary" verify-blob --trusted-root "$root/deploy/signing/trusted-root.json" --bundle "$fixture/syft_1.54.1_checksums.txt.sigstore.json" --certificate-identity https://github.com/anchore/syft/.github/workflows/release.yaml@refs/heads/main --certificate-oidc-issuer https://token.actions.githubusercontent.com --certificate-github-workflow-repository anchore/syft --certificate-github-workflow-trigger workflow_dispatch --certificate-github-workflow-ref refs/heads/main --certificate-github-workflow-sha b254e6d92f28c3868a755f62fb3ca8f26e9fee76)
"${github[@]}" "$fixture/syft_1.54.1_checksums.txt" >"$work/out" 2>&1
ok 'real GitHub certificate SAN issuer repository event ref and invocation SHA pass'
reject "${github[@]}" --certificate-identity https://github.com/anchore/syft/.github/workflows/other.yaml@refs/heads/main "$fixture/syft_1.54.1_checksums.txt"
ok 'wrong GitHub workflow SAN rejected cryptographically'
reject "${github[@]}" --certificate-github-workflow-sha aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$fixture/syft_1.54.1_checksums.txt"
ok 'substituted application/workflow SHA rejected as certificate invocation SHA'
reject "${github[@]}" --certificate-github-workflow-trigger push "$fixture/syft_1.54.1_checksums.txt"
ok 'wrong GitHub event rejected cryptographically'
reject "${github[@]}" --certificate-github-workflow-ref refs/heads/other "$fixture/syft_1.54.1_checksums.txt"
ok 'wrong GitHub ref rejected cryptographically'
reject "${github[@]}" --certificate-github-workflow-repository andresz74/verilio "$fixture/syft_1.54.1_checksums.txt"
ok 'wrong GitHub repository rejected cryptographically'
# Exercise the exact image-verifier CLI without pretending a blob fixture is an
# image fixture: crypto can pass, but native verification must reject its shape.
digest=$(node -e "process.stdout.write(require('crypto').createHash('sha256').update(require('fs').readFileSync(process.argv[1])).digest('hex'))" "$fixture/syft_1.54.1_checksums.txt")
image=("${github[@]}")
image[1]=verify-blob-attestation
reject "${image[@]}" --type https://sigstore.dev/cosign/sign/v1 --check-claims=true --digest "$digest" --digestAlg sha256
grep -q 'bundle does not contain a DSSE envelope' "$work/out"
ok 'actual image-verifier flags parse; authenticated blob fixture cannot substitute for native DSSE image evidence'
printf '%s real distribution-fixture cryptographic checks passed; not Verilio GHCR/OIDC qualification.\n' "$passed"
