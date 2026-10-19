#!/usr/bin/env python3
"""D11.2 only: paired image signatures, not qualification/SBOM attestations."""
import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile

ROOT = Path(__file__).resolve().parent
SERVICES = ("api", "gateway")
REPOSITORIES = {s: f"ghcr.io/andresz74/verilio-{s}" for s in SERVICES}
DIGEST = re.compile(r"sha256:[0-9a-f]{64}\Z")
SHA = re.compile(r"[0-9a-f]{40}\Z")
VERSION = re.compile(r"v\d+\.\d+\.\d+(?:-[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*)?\Z")
LIMIT = 16 * 1024 * 1024
EVIDENCE_FILES = {"qualification.json", "evidence.json", "publication.json", "attempt-status.json", "checksums.txt", "api.spdx.json", "gateway.spdx.json", "api.scan.json", "gateway.scan.json"}


def require(ok, message):
    if not ok:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load(file, limit=LIMIT):
    file = Path(file)
    require(file.is_file() and not file.is_symlink() and file.stat().st_size <= limit, "Invalid bounded regular file")
    return json.loads(file.read_bytes())


def issue(file, data):
    # Exclusive creation: accepted portable material is never overwritten.
    with Path(file).open("xb") as output:
        output.write(data if isinstance(data, bytes) else (json.dumps(data, indent=2) + "\n").encode())


def policy():
    p = load(ROOT / "policy.json")
    pin = load(ROOT / "toolchain.json")
    require(sha((ROOT / "policy.json").read_bytes()) == pin["policy_sha256"], "Unreviewed policy modification")
    require(p["schema"] == "verilio.signer-policy/v1" and re.fullmatch(r"[1-9][0-9]{0,3}", p["version"]), "Unsupported policy version")
    require(p["issuer"] == "https://token.actions.githubusercontent.com" and p["repository"] == "andresz74/verilio" and p["platform"] == "linux/amd64", "Unauthorized policy")
    require(re.fullmatch(r"\.github/workflows/[a-z0-9-]+\.ya?ml", p["workflow"]), "Exact workflow path required")
    require(p["contexts"] == {"push": "refs/tags/{version}", "workflow_dispatch": "refs/heads/main"}, "Unauthorized contexts")
    versions = {p["version"]}
    for old in p["historical_contexts"]:
        require(isinstance(old, dict) and set(old) == {"version", "workflow", "contexts", "release_versions", "revoked"}, "Invalid historical policy")
        require(re.fullmatch(r"[1-9][0-9]{0,3}", old["version"]) and old["version"] not in versions, "Duplicate historical policy version")
        versions.add(old["version"])
        require(re.fullmatch(r"\.github/workflows/[a-z0-9-]+\.ya?ml", old["workflow"]) and old["contexts"] == p["contexts"], "Exact reviewed historical identity required")
        require(isinstance(old["revoked"], bool) and old["release_versions"] and all(VERSION.fullmatch(v) for v in old["release_versions"]), "Explicit historical release allowlist required")
    require(sha((ROOT / "trusted-root.json").read_bytes()) == pin["trusted_root_sha256"], "Untrusted root snapshot")
    require(sha((ROOT / "signing-config.json").read_bytes()) == pin["signing_config_sha256"], "Unreviewed signing configuration")
    return p


def applicable_policy(p, version, release):
    if version == p["version"]:
        return p
    matches = [old for old in p["historical_contexts"] if old["version"] == version and release in old["release_versions"] and not old["revoked"]]
    require(len(matches) == 1, "Historical signer policy is not authorized for this release")
    return {**p, **{k: matches[0][k] for k in ("version", "workflow", "contexts")}}


def expected(version, source, api, gateway, p):
    require(VERSION.fullmatch(version or "") and SHA.fullmatch(source or ""), "Exact version and full source required")
    require(version not in p["denied_versions"] and source not in p["denied_sources"], "Legacy unsigned or denied release")
    require(all(DIGEST.fullmatch(d or "") for d in (api, gateway)), "Both immutable manifest digests required")
    return {"version": version, "source": source, "platform": "linux/amd64", "api": api, "gateway": gateway}


def context(event, ref, invocation, workflow_commit, x, p):
    require(event in p["contexts"], "Unauthorized trigger")
    require(ref == p["contexts"][event].replace("{version}", x["version"]), "Unauthorized workflow ref")
    require(SHA.fullmatch(invocation or "") and SHA.fullmatch(workflow_commit or ""), "Missing invocation/workflow commits")
    require(invocation not in p["denied_invocations"], "Denied invocation")
    if event == "push":
        require(invocation == x["source"], "Tag invocation does not match application source")
    return f'https://github.com/{p["repository"]}/{p["workflow"]}@{ref}'


def claims(service, x, p, event, ref, invocation, workflow_commit):
    context(event, ref, invocation, workflow_commit, x, p)
    return {"verilio.policy": p["version"], "verilio.repository": REPOSITORIES[service],
            "verilio.version": x["version"], "verilio.source": x["source"], "verilio.platform": x["platform"],
            "verilio.api": x["api"], "verilio.gateway": x["gateway"], "verilio.event": event,
            "verilio.ref": ref, "verilio.invocation": invocation, "verilio.workflow": workflow_commit}


def tool(binary):
    pin = load(ROOT / "toolchain.json")
    binary = Path(shutil.which(str(binary)) or binary).resolve(strict=True)
    require(sha(binary.read_bytes()) in pin["executable_sha256"].values(), "Cosign executable checksum mismatch")
    result = subprocess.run([str(binary), "version", "--json"], capture_output=True, timeout=30, check=True)
    require(json.loads(result.stdout)["gitVersion"] == pin["version"], "Wrong Cosign version")
    return str(binary)


def cosign_env(home, signing=False):
    # No ambient COSIGN overrides, registry credentials, proxy, or implicit roots.
    env = {"PATH": os.defpath, "HOME": str(home), "DOCKER_CONFIG": str(home), "SIGSTORE_NO_CACHE": "true"}
    if signing:
        for name in ("ACTIONS_ID_TOKEN_REQUEST_URL", "ACTIONS_ID_TOKEN_REQUEST_TOKEN"):
            require(os.environ.get(name), "Missing GitHub OIDC token capability")
            env[name] = os.environ[name]
        # Only the signing invocation uses the job's explicit GITHUB_TOKEN login.
        env["DOCKER_CONFIG"] = os.environ["DOCKER_CONFIG"]
    return env


def verify_bundle(bundle_file, service, x, p, binary, env):
    b = load(bundle_file)
    require(b.get("mediaType") == p["bundle_media_type"], "Native bundle format required; no legacy fallback")
    require(b.get("verificationMaterial", {}).get("tlogEntries"), "Transparency evidence required")
    envelope = b.get("dsseEnvelope", {})
    require(envelope.get("payloadType") == "application/vnd.in-toto+json" and len(envelope.get("signatures", [])) == 1, "One native image signature required")
    statement = json.loads(base64.b64decode(envelope["payload"], validate=True))
    require(statement.get("_type") == "https://in-toto.io/Statement/v1" and statement.get("predicateType") == p["predicate_type"] and statement.get("predicate") == {}, "Not a built-in image signature")
    require(len(statement.get("subject", [])) == 1, "One exact image subject required")
    subject = statement["subject"][0]
    require(subject.get("digest") == {"sha256": x[service][7:]}, "Wrong signature subject")
    a = subject.get("annotations", {})
    require(all(isinstance(v, str) for v in a.values()), "Invalid signed claims")
    p = applicable_policy(p, a.get("verilio.policy"), x["version"])
    event, ref, invocation, workflow_commit = (a.get("verilio." + k) for k in ("event", "ref", "invocation", "workflow"))
    identity = context(event, ref, invocation, workflow_commit, x, p)
    require(a == claims(service, x, p, event, ref, invocation, workflow_commit), "Wrong signed release/pair/repository claims")
    # These checks select policy, not authenticity. No result is accepted before
    # Cosign validates the DSSE signature, certificate, SCT and tlog under roots.
    command = [binary, "verify-blob-attestation", "--bundle", str(bundle_file), "--trusted-root", str(ROOT / "trusted-root.json"),
               "--type", p["predicate_type"], "--digest", x[service][7:], "--digestAlg", "sha256",
               "--certificate-identity", identity, "--certificate-oidc-issuer", p["issuer"],
               "--certificate-github-workflow-repository", p["repository"], "--certificate-github-workflow-trigger", event,
               "--certificate-github-workflow-ref", ref, "--certificate-github-workflow-sha", invocation]
    subprocess.run(command, env=env, capture_output=True, check=True, timeout=120)
    return (event, ref, invocation, workflow_commit, p["version"])


def get(url, headers=None, limit=LIMIT):
    require(url.startswith("https://"), "HTTPS required")
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=60) as response:
        data = response.read(limit + 1)
    require(len(data) <= limit, "Remote response exceeds bound")
    return data


class Registry:
    """Public GHCR access only. Never consult Docker credentials or user tokens."""
    def __init__(self, service):
        self.repo = REPOSITORIES[service].removeprefix("ghcr.io/")
        token = json.loads(get("https://ghcr.io/token?" + urllib.parse.urlencode({"service": "ghcr.io", "scope": f"repository:{self.repo}:pull"})))
        self.headers = {"Authorization": "Bearer " + token["token"], "Accept": "application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.index.v1+json"}

    def fetch(self, path):
        return get(f"https://ghcr.io/v2/{self.repo}/{path}", self.headers)

    def material(self, digest, version):
        manifest = self.fetch(f"manifests/{digest}")
        require("sha256:" + sha(manifest) == digest, "Manifest digest mismatch")
        m = json.loads(manifest)
        require("manifests" not in m and DIGEST.fullmatch(m.get("config", {}).get("digest", "")), "Single amd64 manifest required")
        config = self.fetch("blobs/" + m["config"]["digest"])
        require("sha256:" + sha(config) == m["config"]["digest"], "Config digest mismatch")
        require("sha256:" + sha(self.fetch("manifests/" + version)) == digest, "Tag mapping changed")
        return manifest, config

    def bundles(self, digest):
        index = json.loads(self.fetch("referrers/" + digest))
        require(len(index.get("manifests", [])) <= 16, "Too many referrers; review required")
        bundles = []
        for descriptor in index.get("manifests", []):
            if descriptor.get("artifactType") != "application/vnd.dev.sigstore.bundle+json;version=0.3":
                continue
            d = descriptor.get("digest", "")
            require(DIGEST.fullmatch(d), "Malformed referrer digest")
            raw = self.fetch("manifests/" + d)
            require("sha256:" + sha(raw) == d, "Referrer digest mismatch")
            m = json.loads(raw)
            require(m.get("subject", {}).get("digest") == digest and len(m.get("layers", [])) == 1, "Referrer subject mismatch")
            layer = m["layers"][0]["digest"]
            require(DIGEST.fullmatch(layer), "Invalid bundle layer")
            blob = self.fetch("blobs/" + layer)
            require("sha256:" + sha(blob) == layer, "Bundle digest mismatch")
            bundles.append(blob)
        return bundles


def check_material(manifest, config, service, x, qualified=None):
    require("sha256:" + sha(manifest) == x[service], "Manifest digest mismatch")
    m, c = json.loads(manifest), json.loads(config)
    require("manifests" not in m and "sha256:" + sha(config) == m.get("config", {}).get("digest"), "Wrong manifest/config relationship")
    if qualified:
        require(m["config"]["digest"] == qualified, "Config is not qualified image ID")
    labels = c.get("config", {}).get("Labels", {})
    require(c.get("os") == "linux" and c.get("architecture") == "amd64" and labels.get("org.opencontainers.image.source") == "https://github.com/andresz74/verilio" and labels.get("org.opencontainers.image.version") == x["version"] and labels.get("org.opencontainers.image.revision") == x["source"], "Wrong platform or OCI source/version/revision")


def verify_directory(directory, x, p, binary):
    contexts = []
    with tempfile.TemporaryDirectory(prefix="verilio-verify-") as home:
        for s in SERVICES:
            manifest = (directory / f"{s}.manifest.json").read_bytes()
            config = (directory / f"{s}.config.json").read_bytes()
            check_material(manifest, config, s, x)
            contexts.append(verify_bundle(directory / f"{s}.sigstore.json", s, x, p, binary, cosign_env(home)))
    require(contexts[0] == contexts[1], "Mixed signing contexts")


def collect(directory, x, p, binary, qualified=None):
    # Fresh output only. Preserve failed/partial evidence; never replace it.
    directory.mkdir(mode=0o700, parents=False, exist_ok=False)
    for s in SERVICES:
        registry = Registry(s)
        manifest, config = registry.material(x[s], x["version"])
        check_material(manifest, config, s, x, qualified[s] if qualified else None)
        issue(directory / f"{s}.manifest.json", manifest)
        issue(directory / f"{s}.config.json", config)
        candidates = registry.bundles(x[s])
        require(candidates, f"Missing anonymous {s} native signature bundle")
        # Conservative conflict policy: no overwrites or selection across signatures.
        require(len(candidates) == 1, "Multiple native signatures require manual review")
        issue(directory / f"{s}.sigstore.json", candidates[0])
    verify_directory(directory, x, p, binary)
    files = {f.name: sha(f.read_bytes()) for f in directory.iterdir()}
    issue(directory / "verification.json", {"schema": "verilio.signature-verification/v1", "release": x, "policy_sha256": sha((ROOT / "policy.json").read_bytes()), "trusted_root_sha256": sha((ROOT / "trusted-root.json").read_bytes()), "toolchain_sha256": sha((ROOT / "toolchain.json").read_bytes()), "files": files, "verification": "paired-passed"})


def validate_portable(directory):
    require(directory.is_dir() and not directory.is_symlink(), "Invalid portable directory")
    names = {f"{s}.{suffix}.json" for s in SERVICES for suffix in ("manifest", "config", "sigstore")} | {"verification.json"}
    require({f.name for f in directory.iterdir()} == names, "Unexpected portable files")
    record = load(directory / "verification.json")
    require(record.get("schema") == "verilio.signature-verification/v1" and record.get("verification") == "paired-passed", "Incomplete portable record")
    require(record.get("policy_sha256") == sha((ROOT / "policy.json").read_bytes()) and record.get("trusted_root_sha256") == sha((ROOT / "trusted-root.json").read_bytes()) and record.get("toolchain_sha256") == sha((ROOT / "toolchain.json").read_bytes()), "Portable trust identity mismatch")
    require(set(record["files"]) == names - {"verification.json"}, "Portable allowlist mismatch")
    for name, digest in record["files"].items():
        load(directory / name)
        require(sha((directory / name).read_bytes()) == digest, "Portable checksum mismatch")
    return record


def sign(directory, output, binary, p):
    require(p["official_signing_enabled"] is True, "Official signing disabled: GHCR/OIDC experiment and owner activation required")
    require(os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("GITHUB_REPOSITORY") == p["repository"] and os.environ.get("GITHUB_JOB") == "sign", "Signing requires isolated authorized CI job")
    publication = json.loads(subprocess.run(["node", str(ROOT.parent / "release-evidence.mjs"), "validate-publication", str(directory)], capture_output=True, check=True, timeout=120).stdout)
    x = expected(publication["version"], publication["source_commit"], *(publication["images"][s]["manifest_digest"] for s in SERVICES), p)
    event, ref = os.environ["GITHUB_EVENT_NAME"], os.environ["GITHUB_REF"]
    invocation, workflow_commit = os.environ["GITHUB_SHA"], os.environ["GITHUB_WORKFLOW_SHA"]
    identity = context(event, ref, invocation, workflow_commit, x, p)
    require(os.environ["GITHUB_WORKFLOW_REF"] == identity.removeprefix("https://github.com/"), "Unexpected workflow definition")
    w = publication["workflow"]
    require(w["run_id"] == os.environ["GITHUB_RUN_ID"] and w["run_attempt"] == os.environ["GITHUB_RUN_ATTEMPT"] and w["commit"] == workflow_commit and w["ref"] == os.environ["GITHUB_WORKFLOW_REF"], "Foreign publication invocation")
    # Resolve application release independently of receipt and workflow checkout.
    tag = json.loads(get(f'https://api.github.com/repos/{p["repository"]}/git/ref/tags/{x["version"]}'))["object"]
    for _ in range(4):
        if tag["type"] != "tag":
            break
        tag = json.loads(get(f'https://api.github.com/repos/{p["repository"]}/git/tags/{tag["sha"]}'))["object"]
    require(tag["type"] == "commit" and tag["sha"] == x["source"], "Application tag/source mismatch")
    output.mkdir(mode=0o700, parents=False, exist_ok=False)
    status = {"schema": "verilio.signing-attempt/v1", "release": x,
              "workflow": {"ref": os.environ["GITHUB_WORKFLOW_REF"], "commit": workflow_commit,
                           "invocation_commit": invocation, "event": event, "run_id": w["run_id"], "run_attempt": w["run_attempt"]},
              "state": "incomplete", "images": {s: "not-attempted" for s in SERVICES}}
    def save():
        temporary = output / ("attempt-status." + uuid.uuid4().hex + ".tmp")
        try:
            with temporary.open("x") as f:
                json.dump(status, f)
            os.replace(temporary, output / "attempt-status.json")
        finally:
            temporary.unlink(missing_ok=True)
    try:
        save()
        # Complete both prechecks before any signature is issued.
        for s in SERVICES:
            r = Registry(s)
            m, c = r.material(x[s], x["version"])
            check_material(m, c, s, x, publication["images"][s]["config_digest"])
            require(not r.bundles(x[s]), "Existing signature requires reviewed metadata recovery")
        with tempfile.TemporaryDirectory(prefix="verilio-sign-") as home:
            env = cosign_env(home, signing=True)
            for s in SERVICES:
                status["images"][s] = "attempted-unknown"
                save()
                command = [binary, "sign", "--yes", "--signing-config", str(ROOT / "signing-config.json"), "--trusted-root", str(ROOT / "trusted-root.json"), "--bundle", str(output / f"{s}.sigstore.json")]
                for k, v in claims(s, x, p, event, ref, invocation, workflow_commit).items():
                    command += ["-a", f"{k}={v}"]
                subprocess.run(command + [REPOSITORIES[s] + "@" + x[s]], env=env, capture_output=True, check=True, timeout=300)
                status["images"][s] = "attached-unverified"
                save()
        collect(output / "portable", x, p, binary, {s: publication["images"][s]["config_digest"] for s in SERVICES})
        # Require registry bundles to equal original emitted bundles exactly.
        for s in SERVICES:
            require((output / f"{s}.sigstore.json").read_bytes() == (output / "portable" / f"{s}.sigstore.json").read_bytes(), "Retrieved signature differs from issued bundle")
            status["images"][s] = "anonymous-verified"
        status["state"] = "paired-verified-artifact-delivery-pending"
        issue(output / "signing.json", {**status, "publication_sha256": sha((directory / "publication.json").read_bytes()), "verification_sha256": sha((output / "portable" / "verification.json").read_bytes())})
        save()
    except BaseException:
        # Attempted-unknown is truthful even for SIGKILL; prior state was persisted.
        status["state"] = "incomplete-review-required"
        save()
        raise


def receive_archives(archives, output):
    output.mkdir(mode=0o700, exist_ok=False)
    seen = set()
    total = 0
    for raw in archives:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            for entry in archive.infolist():
                total += entry.file_size
                require(total <= 230000000, "Expanded artifacts exceed bound")
                require(entry.filename in EVIDENCE_FILES and entry.filename not in seen and not stat.S_ISLNK(entry.external_attr >> 16) and not entry.is_dir() and entry.file_size <= 104857600, "Unsafe/duplicate artifact member")
                seen.add(entry.filename)
                issue(output / entry.filename, archive.read(entry))
    require(seen == EVIDENCE_FILES, "Incomplete publication artifacts")


def receive(output, ids, version):
    require(len(set(ids)) == 2 and all(re.fullmatch(r"[1-9][0-9]*", i) for i in ids), "Two exact artifact IDs required")
    run, attempt = os.environ["GITHUB_RUN_ID"], os.environ["GITHUB_RUN_ATTEMPT"]
    headers = {"Authorization": "Bearer " + os.environ["GH_TOKEN"], "Accept": "application/vnd.github+json"}
    archives = []
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    for i, stage in zip(ids, ("qualified", "published")):
        url = "https://api.github.com/repos/andresz74/verilio/actions/artifacts/" + i
        info = json.loads(get(url, headers))
        require(info["workflow_run"]["id"] == int(run) and info["workflow_run"]["head_sha"] == os.environ["GITHUB_SHA"] and info["name"] == f"sbom-{version}-linux-amd64-{run}-{attempt}-{stage}" and info["expired"] is False and info["size_in_bytes"] <= 220000000, "Foreign/expired artifact")
        # Never forward GitHub authorization to the signed download URL.
        try:
            urllib.request.build_opener(NoRedirect).open(urllib.request.Request(url + "/zip", headers=headers), timeout=60)
            raise ValueError("Expected signed artifact redirect")
        except urllib.error.HTTPError as e:
            require(e.code == 302, "Artifact download failed")
            archives.append(get(e.headers["Location"], limit=220000000))
    receive_archives(archives, output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("verify", "sign", "receive", "install"))
    parser.add_argument("--version")
    parser.add_argument("--source-commit")
    parser.add_argument("--api-digest")
    parser.add_argument("--gateway-digest")
    parser.add_argument("--cosign", default="cosign")
    parser.add_argument("--bundle-dir", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--evidence-dir", type=Path)
    parser.add_argument("--artifact-ids", nargs=2)
    a = parser.parse_args()
    p = policy()
    if a.command == "receive":
        require(a.output_dir and a.artifact_ids and VERSION.fullmatch(a.version or ""), "Receive inputs required")
        receive(a.output_dir, a.artifact_ids, a.version)
        return
    if a.command == "install":
        require(a.output_dir, "New tools output directory required")
        a.output_dir.mkdir(mode=0o700, exist_ok=False)
        pin = load(ROOT / "toolchain.json")
        raw = get(pin["url"], limit=200000000)
        require(sha(raw) == pin["executable_sha256"]["linux/amd64"], "Invalid Cosign distribution checksum")
        issue(a.output_dir / "cosign", raw)
        (a.output_dir / "cosign").chmod(0o700)
        tool(a.output_dir / "cosign")
        return
    binary = tool(a.cosign)
    if a.command == "sign":
        require(a.evidence_dir and a.output_dir, "Sign inputs required")
        sign(a.evidence_dir, a.output_dir, binary, p)
    else:
        x = expected(a.version, a.source_commit, a.api_digest, a.gateway_digest, p)
        if a.bundle_dir:
            record = validate_portable(a.bundle_dir)
            require(record["release"] == x, "Portable release differs from trusted inputs")
            verify_directory(a.bundle_dir, x, p, binary)
        else:
            require(a.output_dir, "New portable output directory required")
            collect(a.output_dir, x, p, binary)
        print("Both official image signatures verified under policy " + p["version"])


if __name__ == "__main__":
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        # Do not print remote bodies, subprocess output, tokens or credential paths.
        print("Signature operation failed closed: " + (str(error) if isinstance(error, ValueError) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
