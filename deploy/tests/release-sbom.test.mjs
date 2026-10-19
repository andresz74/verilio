import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  qualification,
  state,
  sbom,
  checksum,
  issue,
  pin,
  validateSchema,
} from "../release-evidence.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verilio-sbom-test-"));
process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));
const ids = {
  api: `sha256:${"1".repeat(64)}`,
  gateway: `sha256:${"2".repeat(64)}`,
};
const manifest = `sha256:${"3".repeat(64)}`;
const policy = JSON.parse(
  fs.readFileSync(path.join(root, "deploy/sbom/coverage.json")),
);
const q = {
  schema: "verilio.release-evidence/v1",
  stage: "qualification",
  version: "v9.8.7-test",
  source_commit: "a".repeat(40),
  platform: "linux/amd64",
  workflow: {
    repository: "andresz74/verilio",
    ref: "andresz74/verilio/.github/workflows/publish-images.yml@refs/tags/v9.8.7-test",
    commit: "b".repeat(40),
    run_id: "1",
    run_attempt: "1",
    job: "publish",
  },
  images: Object.fromEntries(
    Object.entries(ids).map(([s, id]) => [
      s,
      { id, repository: `ghcr.io/andresz74/verilio-${s}` },
    ]),
  ),
  qualification: "passed",
};
const clone = (x) => JSON.parse(JSON.stringify(x));
function document(service) {
  const packages = [
    {
      SPDXID: "SPDXRef-image",
      name: "sha256",
      versionInfo: ids[service].slice(7),
      downloadLocation: "NOASSERTION",
      checksums: [{ algorithm: "SHA256", checksumValue: manifest.slice(7) }],
    },
    ...policy[service].map((p, i) => ({
      SPDXID: `SPDXRef-p${i}`,
      name: p.name,
      versionInfo: p.version ?? "1",
      downloadLocation: "NOASSERTION",
      externalRefs: [
        {
          referenceCategory: "PACKAGE-MANAGER",
          referenceType: "purl",
          referenceLocator: `${p.purl_prefix}${p.name.split("/").map(encodeURIComponent).join("/")}@${p.version ?? "1"}`,
        },
      ],
    })),
  ];
  return {
    spdxVersion: "SPDX-2.3",
    SPDXID: "SPDXRef-DOCUMENT",
    dataLicense: "CC0-1.0",
    name: "sample",
    documentNamespace: "https://example.invalid/sbom/1",
    creationInfo: {
      creators: [`Tool: syft-${pin.version}`],
      created: "2026-10-19T00:00:00Z",
    },
    packages,
    relationships: [
      {
        spdxElementId: "SPDXRef-DOCUMENT",
        relatedSpdxElement: "SPDXRef-image",
        relationshipType: "DESCRIBES",
      },
      ...packages
        .slice(1)
        .map((p) => ({
          spdxElementId: "SPDXRef-image",
          relatedSpdxElement: p.SPDXID,
          relationshipType: "CONTAINS",
        })),
    ],
  };
}
function fixture(service, mutate = () => {}) {
  const d = document(service);
  mutate(d);
  const file = path.join(tmp, `${service}-${Math.random()}.json`);
  fs.writeFileSync(file, JSON.stringify(d));
  return file;
}
for (const service of ["api", "gateway"])
  test(`${service} representative SPDX document passes`, () =>
    assert.match(
      sbom(fixture(service), service, ids[service], manifest),
      /^[a-f0-9]{64}$/,
    ));
for (const [label, mutate] of [
  ["missing API", (x) => delete x.images.api],
  ["missing Gateway", (x) => delete x.images.gateway],
  ["malformed ID", (x) => (x.images.api.id = "sha256:short")],
  ["tag ID", (x) => (x.images.api.id = "verilio-api:v9.8.7-test")],
  ["wrong source", (x) => (x.source_commit = "short")],
  ["wrong platform", (x) => (x.platform = "linux/arm64")],
  ["floating version", (x) => (x.version = "latest")],
  [
    "wrong repository",
    (x) => (x.images.api.repository = "registry.invalid/api"),
  ],
  ["failed qualification", (x) => (x.qualification = "failed")],
  ["candidate is unqualified", (x) => (x.stage = "candidate")],
  ["missing workflow", (x) => delete x.workflow],
  ["workflow/application SHA separation", (x) => (x.workflow.commit = "short")],
])
  test(`reject ${label}`, () => {
    const r = clone(q);
    mutate(r);
    assert.throws(() => qualification(r));
  });
test("valid paired qualification", () => qualification(q));
for (const [label, mutate] of [
  ["wrong SPDX version", (x) => (x.spdxVersion = "SPDX-3.0")],
  ["missing required field", (x) => delete x.creationInfo],
  ["wrong property type", (x) => (x.packages = "packages")],
  ["unknown schema property", (x) => (x.unknown = true)],
  [
    "dangling relationship",
    (x) => (x.relationships[0].relatedSpdxElement = "SPDXRef-missing"),
  ],
  ["missing describes", (x) => x.relationships.shift()],
  [
    "missing containment",
    (x) => (x.relationships = x.relationships.slice(0, 1)),
  ],
  ["wrong config ID", (x) => (x.packages[0].versionInfo = "f".repeat(64))],
  [
    "wrong local manifest",
    (x) => (x.packages[0].checksums[0].checksumValue = "f".repeat(64)),
  ],
  ["missing API dependency", (x) => (x.packages[2].name = "absent")],
  ["wrong dependency version", (x) => (x.packages[3].versionInfo = "wrong")],
  ["wrong purl category", (x) => (x.packages[3].externalRefs = [])],
  ["purl names another package", (x) => (x.packages[3].externalRefs[0].referenceLocator = "pkg:npm/wrong@5.12.1")],
  ["duplicate SPDX IDs", (x) => (x.packages[2].SPDXID = x.packages[1].SPDXID)],
  [
    "wrong scanner identity",
    (x) => (x.creationInfo.creators = ["Tool: unknown"]),
  ],
  [
    "secret content",
    (x) => (x.comment = "postgresql://user:secret@example.invalid/db"),
  ],
  ["host path content", (x) => (x.comment = "/Users/private/source")],
])
  test(`reject ${label}`, () =>
    assert.throws(() =>
      sbom(fixture("api", mutate), "api", ids.api, manifest),
    ));
test("schema validator refuses unsupported keywords", () =>
  assert.throws(() => validateSchema({}, { anyOf: [] })));
test("Gateway OS/Caddy discovery does not establish bundled React completeness", () => {
  const d = document("gateway");
  assert.equal(
    d.packages.some((p) => p.name === "react"),
    false,
  );
  sbom(fixture("gateway"), "gateway", ids.gateway, manifest);
  assert.match(
    policy.gateway_limitation,
    /not a complete shipped-web-dependency inventory/,
  );
});
test("coverage versions match resolved lockfile, not only manifest ranges", () => {
  const lock = fs.readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8");
  for (const p of policy.api.filter((p) => p.purl_prefix === "pkg:npm/"))
    assert.ok(lock.includes(`${p.name}@${p.version}`));
});
test("schema pin matches official vendored bytes", () =>
  assert.equal(
    checksum(path.join(root, "deploy/sbom/spdx-2.3.schema.json")),
    pin.schema_sha256,
  ));
test("configuration pin matches bytes", () =>
  assert.equal(
    checksum(path.join(root, "deploy/sbom/syft.yaml")),
    pin.configuration_sha256,
  ));
test("immutable issue refuses existing evidence and preserves bytes", () => {
  const file = path.join(tmp, "immutable.json");
  issue(file, q);
  const before = checksum(file);
  assert.throws(() => issue(file, { changed: true }));
  assert.equal(checksum(file), before);
});
test("symlink evidence is refused", () => {
  const file = path.join(tmp, "link");
  fs.symlinkSync(fixture("api"), file);
  assert.throws(() => sbom(file, "api", ids.api, manifest));
});

const sandbox = path.join(tmp, "sandbox");
fs.mkdirSync(sandbox);
fs.cpSync(path.join(root, "deploy"), path.join(sandbox, "deploy"), {
  recursive: true,
});
const bin = path.join(sandbox, "bin");
fs.mkdirSync(bin);
const docker = `#!/usr/bin/env node
const a=process.argv.slice(2),fs=require('fs');
fs.appendFileSync(${JSON.stringify(path.join(tmp, "commands"))},a.join(' ')+'\\n');
if(a[0]==='context') {console.log('unix:///var/run/docker.sock');process.exit(0);}
if(a[0]==='inspect') {console.log(process.env.WRONG_CONTAINER?'sha256:'+ 'f'.repeat(64):${JSON.stringify(ids.api)});process.exit(0);}
if(a[0]!=='image'||a[1]!=='inspect')process.exit(90);
const id=a[2].includes('gateway')||a[2]===${JSON.stringify(ids.gateway)}?${JSON.stringify(ids.gateway)}:${JSON.stringify(ids.api)};
console.log(JSON.stringify([{Id:process.env.DRIFT?'sha256:'+'f'.repeat(64):id,Os:'linux',Architecture:'amd64',Config:{Labels:{'org.opencontainers.image.source':'https://github.com/andresz74/verilio','org.opencontainers.image.version':'v9.8.7-test','org.opencontainers.image.revision':'a'.repeat(40)}}}]));
`;
fs.writeFileSync(path.join(bin, "docker"), docker, { mode: 0o755 });
const scanner = path.join(bin, "syft");
fs.writeFileSync(
  scanner,
  `#!/usr/bin/env node
const fs=require('fs'),a=process.argv.slice(2);
if(a[0]==='version'){console.log('{"version":"1.54.1"}');process.exit(0);}
if(a[0]!=='scan'||a[1]!=='--from'||a[2]!=='docker'||!/^sha256:[0-9a-f]{64}$/.test(a[3]))process.exit(91);
const service=a[3]===${JSON.stringify(ids.api)}?'api':'gateway';
const doc=service==='api'?${JSON.stringify(document("api"))}:${JSON.stringify(document("gateway"))};
for(let i=0;i<a.length;i++)if(a[i]==='-o'){
 const split=a[++i].indexOf('='),format=a[i].slice(0,split),file=a[i].slice(split+1);
 if(format==='spdx-json@2.3')fs.writeFileSync(file,JSON.stringify(doc));
 else if(format==='syft-json')fs.writeFileSync(file,JSON.stringify({source:{type:'image',metadata:{imageID:a[3],userInput:a[3],manifestDigest:${JSON.stringify(manifest)},os:'linux',architecture:'amd64'}}}));
 else process.exit(92);
}
`,
  { mode: 0o755 },
);
const tool = path.join(sandbox, "deploy/release-evidence.mjs");
const toolPin = path.join(sandbox, "deploy/sbom/toolchain.json");
const mockPin = JSON.parse(fs.readFileSync(toolPin));
mockPin.binary_sha256 = checksum(scanner);
fs.writeFileSync(toolPin, JSON.stringify(mockPin));
const qfile = path.join(tmp, "qualification.json");
issue(qfile, q);
const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
delete env.DOCKER_HOST;
const run = (args, extra = {}) =>
  spawnSync(process.execPath, [tool, ...args], {
    env: { ...env, ...extra },
    encoding: "utf8",
  });
let accepted;
test("paired generator scans exact IDs and accepts unchanged original bytes", () => {
  accepted = path.join(tmp, "accepted");
  const result = run(["generate", qfile, accepted, scanner]);
  assert.equal(result.status, 0, result.stderr);
  const e = JSON.parse(fs.readFileSync(path.join(accepted, "evidence.json")));
  assert.equal(
    e.images.api.sha256,
    checksum(path.join(accepted, "api.spdx.json")),
  );
  assert.equal(
    e.images.gateway.sha256,
    checksum(path.join(accepted, "gateway.spdx.json")),
  );
});
test("valid strict publisher input passes before any registry interaction", () => {
  const r = run(["validate", accepted, q.version, q.source_commit]);
  assert.equal(r.status, 0, r.stderr);
});
test("accepted output directory cannot be overwritten", () =>
  assert.notEqual(run(["generate", qfile, accepted, scanner]).status, 0));
test("scanner checksum failure refuses before output mutation", () => {
  const out = path.join(tmp, "wrong-binary");
  assert.notEqual(
    run(["generate", qfile, out, path.join(bin, "docker")]).status,
    0,
  );
  assert.equal(fs.existsSync(out), false);
});
test("ID drift rejects before generation", () =>
  assert.notEqual(
    run(["generate", qfile, path.join(tmp, "drift"), scanner], { DRIFT: "yes" })
      .status,
    0,
  ));
test("runtime container mismatch fails strict qualification", () => {
  const c = path.join(tmp, "candidate.json");
  issue(c, { ...q, stage: "candidate" });
  assert.notEqual(
    run(["container", c, "api", "container"], { WRONG_CONTAINER: "yes" })
      .status,
    0,
  );
});
test("publication receipt cannot precede both anonymous verifications", () =>
  assert.notEqual(
    run(["publish-receipt", accepted, manifest, manifest]).status,
    0,
  ));
test("qualified config ID is distinct from scan/remote manifest digest", () => {
  assert.notEqual(ids.api, manifest);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(accepted, "api.scan.json")))
      .config_digest,
    ids.api,
  );
});
test("successful publication receipt requires both anonymous results and preserves SBOM bytes", () => {
  const before = checksum(path.join(accepted, "api.spdx.json"));
  for (const component of ["api", "gateway"])
    assert.equal(
      run(["status", accepted, component, "anonymous_verified"]).status,
      0,
    );
  const r = run([
    "publish-receipt",
    accepted,
    manifest,
    `sha256:${"4".repeat(64)}`,
  ]);
  assert.equal(r.status, 0, r.stderr);
  const receipt = JSON.parse(
    fs.readFileSync(path.join(accepted, "publication.json")),
  );
  assert.equal(receipt.images.api.config_digest, ids.api);
  assert.equal(receipt.images.api.manifest_digest, manifest);
  assert.equal(checksum(path.join(accepted, "api.spdx.json")), before);
  assert.notEqual(
    run(["publish-receipt", accepted, manifest, manifest]).status,
    0,
  );
});
for (const [name, edit] of [
  ["wrong scanner version", (x) => x.replace("1.54.1", "0.0.0")],
  [
    "API scanner failure",
    (x) =>
      x.replace(
        "const service=a[3]",
        "if(a[0]==='scan'&&a[3].includes('111111'))process.exit(7);const service=a[3]",
      ),
  ],
  [
    "Gateway scanner failure",
    (x) =>
      x.replace(
        "const service=a[3]",
        "if(a[0]==='scan'&&a[3].includes('222222'))process.exit(7);const service=a[3]",
      ),
  ],
  [
    "substituted native source",
    (x) => x.replace("imageID:a[3]", "imageID:'sha256:'+'f'.repeat(64)"),
  ],
  ["malformed JSON", (x) => x.replace("JSON.stringify(doc)", "'{broken'")],
])
  test(`generator refuses ${name} without paired evidence`, () => {
    const original = fs.readFileSync(scanner, "utf8");
    fs.writeFileSync(scanner, edit(original));
    mockPin.binary_sha256 = checksum(scanner);
    fs.writeFileSync(toolPin, JSON.stringify(mockPin));
    const out = path.join(tmp, name.replaceAll(" ", "-"));
    try {
      const r = run(["generate", qfile, out, scanner]);
      assert.notEqual(r.status, 0);
      assert.equal(fs.existsSync(path.join(out, "evidence.json")), false);
      if (name === "Gateway scanner failure") {
        assert.ok(fs.existsSync(path.join(out, "api.spdx.json")));
        assert.equal(
          JSON.parse(fs.readFileSync(path.join(out, "attempt-status.json")))
            .publication,
          "blocked_evidence_failure",
        );
      }
    } finally {
      fs.writeFileSync(scanner, original);
      mockPin.binary_sha256 = checksum(scanner);
      fs.writeFileSync(toolPin, JSON.stringify(mockPin));
    }
  });
test("configuration drift refuses generation", () => {
  const file = path.join(sandbox, "deploy/sbom/syft.yaml"),
    original = fs.readFileSync(file);
  fs.appendFileSync(file, "\n");
  try {
    assert.notEqual(
      run(["generate", qfile, path.join(tmp, "config-drift"), scanner]).status,
      0,
    );
  } finally {
    fs.writeFileSync(file, original);
  }
});
test("checksum tampering is refused", () => {
  const file = path.join(accepted, "api.spdx.json");
  fs.appendFileSync(file, "\n");
  assert.notEqual(
    run(["validate", accepted, q.version, q.source_commit]).status,
    0,
  );
});
test("generation mock operations stayed local and read-only", () =>
  assert.doesNotMatch(
    fs.readFileSync(path.join(tmp, "commands"), "utf8"),
    /push|pull|login|build|save|export/,
  ));
test("scanner/evidence are not injected into image builds or the archive", () => {
  for (const file of ["deploy/Dockerfile", "deploy/build-release.sh", "deploy/export-release.sh"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), "utf8"), /syft|generate-release-sbom|release-evidence/);
  }
});
test("legacy helper and strict runtime checks remain in full gate", () => {
  const text = fs.readFileSync(
    path.join(root, "deploy/test-release.sh"),
    "utf8",
  );
  for (const name of [
    "playwright",
    "verify-data.sh",
    "backup.sh",
    "restore-drill.sh",
    "assert_test_images",
  ])
    assert.ok(text.includes(name));
});

const originalDocker = fs.readFileSync(path.join(bin, "docker"), "utf8");
const registryPrelude = `
const marker=${JSON.stringify(path.join(tmp, "pushed-"))};
const service=a.join(' ').includes('gateway')?'gateway':'api';
const id=service==='api'?${JSON.stringify(ids.api)}:${JSON.stringify(ids.gateway)};
const remote=service==='api'?'sha256:'+'4'.repeat(64):'sha256:'+'5'.repeat(64);
if(a[0]==='tag')process.exit(0);
if(a[0]==='logout')process.exit(0);
if(a[0]==='push'){
 if((process.env.SCENARIO==='gateway-push-failure'&&service==='gateway')||(process.env.SCENARIO==='api-push-failure'&&service==='api'))process.exit(9);
 fs.writeFileSync(marker+service,'yes');process.exit(0);
}
if(a[0]==='buildx'){
 if(process.env.SCENARIO==='registry-error'){console.error('registry unavailable');process.exit(6);}
 if(process.env.SCENARIO==='both-exist' || (process.env.SCENARIO==='partial'&&service==='api')){console.log('{}');process.exit(0);}
 if(!fs.existsSync(marker+service)){console.error('manifest unknown');process.exit(1);}
 if(process.env.SCENARIO==='anonymous-failure'&&process.env.DOCKER_CONFIG?.endsWith('/anonymous'))process.exit(8);
 if(a.at(-1)==='--raw')console.log(JSON.stringify({schemaVersion:2,...(process.env.SCENARIO==='index'?{manifests:[]}:{}),config:{digest:process.env.SCENARIO==='remote-config-mismatch'?'sha256:'+'f'.repeat(64):id}}));
 else if(a.at(-1)==='{{.Manifest.Digest}}')console.log(remote);
 else if(a.at(-1)==='{{json .Image}}')console.log(JSON.stringify({os:'linux',architecture:'amd64',config:{Labels:{'org.opencontainers.image.source':'https://github.com/andresz74/verilio','org.opencontainers.image.version':'v9.8.7-test','org.opencontainers.image.revision':'a'.repeat(40)}}}));
 else process.exit(99);
 process.exit(0);
}
`;
fs.writeFileSync(
  path.join(bin, "docker"),
  originalDocker.replace(
    "if(a[0]==='context')",
    "{\n" + registryPrelude + "}\nif(a[0]==='context')",
  ),
);
fs.writeFileSync(
  path.join(sandbox, "deploy/verify-official-release-source.sh"),
  '#!/usr/bin/env bash\nprintf "%s\\n" ' + q.source_commit + "\n",
  { mode: 0o755 },
);
let n = 0;
function publishedAttempt(scenario, modify = () => {}) {
  for (const service of ["api", "gateway"])
    fs.rmSync(path.join(tmp, "pushed-" + service), { force: true });
  const dir = path.join(tmp, "publisher-" + ++n);
  fs.mkdirSync(dir);
  for (const file of [
    "qualification.json",
    "evidence.json",
    "checksums.txt",
    "api.spdx.json",
    "gateway.spdx.json",
    "api.scan.json",
    "gateway.scan.json",
  ])
    fs.copyFileSync(path.join(accepted, file), path.join(dir, file));
  // The tampering test deliberately appended whitespace; restore exact accepted bytes.
  const api = path.join(dir, "api.spdx.json");
  fs.writeFileSync(api, JSON.stringify(document("api")));
  modify(dir);
  fs.writeFileSync(path.join(tmp, "commands"), "");
  const result = spawnSync(
    "bash",
    [
      path.join(sandbox, "deploy/publish-release-images.sh"),
      q.version,
      "--evidence-dir",
      dir,
    ],
    { env: { ...env, SCENARIO: scenario }, encoding: "utf8" },
  );
  return {
    dir,
    result,
    log: fs.readFileSync(path.join(tmp, "commands"), "utf8"),
  };
}
test("strict publisher accepts paired evidence and writes verified digest/config mapping", () => {
  const { dir, result, log } = publishedAttempt("success");
  assert.equal(result.status, 0, result.stderr);
  const pub = JSON.parse(fs.readFileSync(path.join(dir, "publication.json")));
  assert.equal(pub.images.api.config_digest, ids.api);
  assert.equal(pub.images.api.manifest_digest, "sha256:" + "4".repeat(64));
  assert.equal(pub.images.gateway.anonymous, "passed");
  assert.equal((log.match(/^push /gm) || []).length, 2);
  assert.match(log, /@sha256:[0-9a-f]{64} --raw/);
  assert.doesNotMatch(log, /login|pull|buildx build|delete/);
});
for (const scenario of [
  "both-exist",
  "partial",
  "api-push-failure",
  "gateway-push-failure",
  "remote-config-mismatch",
  "index",
  "anonymous-failure",
])
  test(`strict publisher ${scenario} preserves incomplete status`, () => {
    const { dir, result } = publishedAttempt(scenario);
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(path.join(dir, "publication.json")), false);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(dir, "attempt-status.json")))
        .publication,
      scenario === "both-exist"
        ? "refused_existing_tags"
        : scenario === "partial"
          ? "refused_partial_existing_tags"
          : "failed_review_registry_state",
    );
    if (scenario === "gateway-push-failure")
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(dir, "attempt-status.json")))
          .images.api,
        "push_accepted_unverified",
      );
  });
test("strict publisher missing evidence refuses before registry operations", () => {
  const { dir, result, log } = publishedAttempt("success", (dir) =>
    fs.unlinkSync(path.join(dir, "evidence.json")),
  );
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(log, /buildx|tag |push /);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, "attempt-status.json")))
      .publication,
    "failed_before_registry_interaction",
  );
  assert.match(
    result.stdout,
    /Publication status: failed_before_registry_interaction/,
  );
});
test("strict publisher checksum failure refuses before registry operations", () => {
  const { dir, result, log } = publishedAttempt("success", (dir) =>
    fs.appendFileSync(path.join(dir, "gateway.spdx.json"), " "),
  );
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(log, /buildx|tag |push /);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, "attempt-status.json")))
      .publication,
    "failed_before_registry_interaction",
  );
  assert.match(
    result.stdout,
    /Publication status: failed_before_registry_interaction/,
  );
});

test("artifact-delivery failure is recorded separately from verified publication", () => {
  const { dir, result } = publishedAttempt("success");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(run(["status", dir, "delivery", "incomplete"]).status, 0);
  const status = JSON.parse(
    fs.readFileSync(path.join(dir, "attempt-status.json")),
  );
  assert.equal(status.publication, "verified");
  assert.equal(status.delivery, "incomplete");
});

test("registry inspection error is distinguished from an attempted push", () => {
  const { dir, result, log } = publishedAttempt("registry-error");
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(log, /^push /m);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, "attempt-status.json")))
      .publication,
    "failed_before_push",
  );
});
test("interrupted status temp files cannot block or replace accepted status", () => {
  const dir = path.join(tmp, "interrupted-status");
  fs.mkdirSync(dir);
  state(dir, "api", "push_accepted_unverified");
  const old = path.join(dir, "attempt-status.json.tmp");
  const abandoned = path.join(dir, "attempt-status.json.interrupted.tmp");
  fs.writeFileSync(old, "partial JSON");
  fs.writeFileSync(abandoned, "partial JSON");
  state(dir, "publication", "failed_review_registry_state");
  const actual = JSON.parse(
    fs.readFileSync(path.join(dir, "attempt-status.json")),
  );
  assert.equal(actual.images.api, "push_accepted_unverified");
  assert.equal(actual.publication, "failed_review_registry_state");
  assert.equal(fs.readFileSync(old, "utf8"), "partial JSON");
  assert.equal(fs.readFileSync(abandoned, "utf8"), "partial JSON");
  assert.equal(fs.readdirSync(dir).length, 3);
});
test("failed atomic status replacement preserves previous status and removes only its own temp", () => {
  const dir = path.join(tmp, "status-rename-failure");
  fs.mkdirSync(dir);
  state(dir, "api", "push_accepted_unverified");
  const before = checksum(path.join(dir, "attempt-status.json"));
  const rename = fs.renameSync;
  try {
    fs.renameSync = () => {
      throw new Error("injected rename failure");
    };
    assert.throws(() =>
      state(dir, "publication", "failed_review_registry_state"),
    );
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(checksum(path.join(dir, "attempt-status.json")), before);
  assert.deepEqual(fs.readdirSync(dir), ["attempt-status.json"]);
});
