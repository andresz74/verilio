// D11.1: unsigned CI evidence, not a generic attestation framework.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import process from "node:process";
import console from "node:console";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
export const pin = JSON.parse(
  fs.readFileSync(path.join(root, "sbom/toolchain.json")),
);
const coverage = JSON.parse(
  fs.readFileSync(path.join(root, "sbom/coverage.json")),
);
const digest = /^sha256:[0-9a-f]{64}$/;
const hash = /^[0-9a-f]{64}$/;
const source = "https://github.com/andresz74/verilio";
const services = ["api", "gateway"];
const schema = "verilio.release-evidence/v1";
export function requireThat(ok, message) {
  if (!ok) throw new Error(message);
}
export const checksum = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
export function read(file) {
  requireThat(
    fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink(),
    "Expected a regular evidence file",
  );
  requireThat(
    fs.statSync(file).size <= pin.max_output_bytes,
    "Evidence exceeds size bound",
  );
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
export function issue(file, data) {
  // link is an atomic, no-overwrite publication of a complete sibling file.
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  try {
    fs.linkSync(temporary, file);
  } finally {
    fs.unlinkSync(temporary);
  }
}
export function base(record, stage) {
  const fields = [
    "schema",
    "stage",
    "version",
    "source_commit",
    "platform",
    "workflow",
    "images",
    "qualification",
  ];
  if (stage === "evidence")
    fields.push(
      "qualification_sha256",
      "format",
      "scanner",
      "gateway_limitation",
      "generation",
    );
  if (stage === "publication") fields.push("evidence_sha256", "publication");
  requireThat(
    Object.keys(record).every((k) => fields.includes(k)),
    "Unknown receipt field",
  );
  requireThat(
    record.schema === schema && record.stage === stage,
    "Wrong evidence contract/stage",
  );
  requireThat(
    /^v\d+\.\d+\.\d+(?:-[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*)?$/.test(
      record.version,
    ),
    "Invalid release version",
  );
  requireThat(
    /^[0-9a-f]{40}$/.test(record.source_commit),
    "Invalid full source commit",
  );
  requireThat(
    record.platform === "linux/amd64",
    "Only linux/amd64 is qualified",
  );
  requireThat(
    record.workflow?.repository === "andresz74/verilio" &&
      /^[0-9]+$/.test(record.workflow.run_id) &&
      /^[1-9][0-9]*$/.test(record.workflow.run_attempt) &&
      /^[0-9a-f]{40}$/.test(record.workflow.commit) &&
      typeof record.workflow.ref === "string" &&
      /^andresz74\/verilio\/\.github\/workflows\/publish-images\.yml@refs\/[A-Za-z0-9_./-]+$/.test(
        record.workflow.ref,
      ) &&
      record.workflow.job === "publish",
    "Missing workflow/run identity",
  );
  requireThat(
    Object.keys(record.workflow).sort().join(",") ===
      "commit,job,ref,repository,run_attempt,run_id",
    "Unknown workflow field",
  );
  requireThat(
    record.images &&
      Object.keys(record.images).sort().join(",") === "api,gateway",
    "Expected exactly API and Gateway",
  );
  for (const service of services) {
    const imageFields = ["repository", "id"];
    if (stage === "evidence" || stage === "publication")
      imageFields.push("sbom", "sha256", "scan_sha256", "coverage");
    if (stage === "publication")
      imageFields.push(
        "ref",
        "manifest_digest",
        "config_digest",
        "digest_pinned_identity",
        "anonymous",
      );
    requireThat(
      Object.keys(record.images[service]).every((k) => imageFields.includes(k)),
      "Unknown component field",
    );
    requireThat(
      digest.test(record.images?.[service]?.id),
      `Missing qualified ${service} image ID`,
    );
    requireThat(
      record.images[service].repository ===
        `ghcr.io/andresz74/verilio-${service}`,
      "Wrong official repository",
    );
  }
}
export function qualification(record) {
  base(record, "qualification");
  requireThat(record.qualification === "passed", "Qualification did not pass");
}
function docker(...args) {
  return execFileSync("docker", args, { encoding: "utf8" }).trim();
}
export function inspect(record) {
  for (const service of services) {
    const expected = record.images[service].id;
    for (const ref of [expected, `verilio-${service}:${record.version}`]) {
      const image = JSON.parse(docker("image", "inspect", ref))[0];
      const labels = image.Config?.Labels ?? {};
      requireThat(
        image.Id === expected &&
          `${image.Os}/${image.Architecture}` === record.platform &&
          labels["org.opencontainers.image.source"] === source &&
          labels["org.opencontainers.image.version"] === record.version &&
          labels["org.opencontainers.image.revision"] === record.source_commit,
        `${service} image identity/labels drifted`,
      );
    }
  }
}
// The pinned official schema uses only these validation keywords. Unsupported
// keywords fail closed, rather than silently turning this into a partial validator.
export function validateSchema(value, spec) {
  const allowed = [
    "$id",
    "$schema",
    "description",
    "title",
    "type",
    "enum",
    "required",
    "properties",
    "additionalProperties",
    "items",
    "minItems",
  ];
  for (const key of Object.keys(spec))
    requireThat(allowed.includes(key), `Unsupported schema keyword: ${key}`);
  if (spec.type)
    requireThat(
      spec.type === "array"
        ? Array.isArray(value)
        : spec.type === "object"
          ? value !== null && typeof value === "object" && !Array.isArray(value)
          : typeof value === spec.type,
      "SPDX schema type mismatch",
    );
  if (spec.enum)
    requireThat(spec.enum.includes(value), "SPDX schema enum mismatch");
  if (spec.required)
    for (const key of spec.required)
      requireThat(Object.hasOwn(value, key), `SPDX required field: ${key}`);
  if (Array.isArray(value)) {
    requireThat(
      value.length >= (spec.minItems ?? 0),
      "SPDX array is too short",
    );
    if (spec.items) for (const item of value) validateSchema(item, spec.items);
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (spec.properties?.[key]) validateSchema(child, spec.properties[key]);
      else
        requireThat(spec.additionalProperties !== false, "Unknown SPDX field");
    }
  }
}
export function sbom(file, service, id, scanManifest) {
  const doc = read(file);
  const text = fs.readFileSync(file, "utf8");
  requireThat(
    !/(?:\/Users\/|\/home\/runner\/|BEGIN .*PRIVATE KEY|postgres(?:ql)?:\/\/[^\s"]+:[^\s"]+@|(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,})/.test(
      text,
    ),
    "Sensitive evidence content",
  );
  requireThat(
    checksum(path.join(root, "sbom/spdx-2.3.schema.json")) ===
      pin.schema_sha256,
    "SPDX schema changed",
  );
  validateSchema(doc, read(path.join(root, "sbom/spdx-2.3.schema.json")));
  requireThat(
    doc.spdxVersion === "SPDX-2.3" &&
      doc.SPDXID === "SPDXRef-DOCUMENT" &&
      doc.dataLicense === "CC0-1.0",
    "Expected SPDX 2.3",
  );
  requireThat(
    typeof doc.documentNamespace === "string" &&
      /^https?:\/\//.test(doc.documentNamespace),
    "Missing document namespace",
  );
  requireThat(
    doc.creationInfo.creators.includes(`Tool: syft-${pin.version}`),
    "Wrong SPDX scanner identity",
  );
  const packages = doc.packages ?? [];
  const ids = new Set([doc.SPDXID]);
  for (const item of [
    ...packages,
    ...(doc.files ?? []),
    ...(doc.snippets ?? []),
  ]) {
    requireThat(
      /^SPDXRef-[A-Za-z0-9.-]+$/.test(item.SPDXID) && !ids.has(item.SPDXID),
      "Invalid/duplicate SPDX ID",
    );
    ids.add(item.SPDXID);
  }
  for (const rel of doc.relationships ?? [])
    requireThat(
      ids.has(rel.spdxElementId) &&
        (ids.has(rel.relatedSpdxElement) ||
          ["NONE", "NOASSERTION"].includes(rel.relatedSpdxElement)),
      "Dangling SPDX relationship",
    );
  const subjects = packages.filter((p) =>
    p.checksums?.some(
      (c) =>
        c.algorithm === "SHA256" && c.checksumValue === scanManifest?.slice(7),
    ),
  );
  requireThat(
    subjects.length === 1,
    "SPDX subject does not match qualified config ID",
  );
  requireThat(
    digest.test(scanManifest) &&
      digest.test(id) &&
      subjects[0].name === "sha256" &&
      subjects[0].versionInfo === id.slice(7),
    "Wrong exact-ID SPDX subject",
  );
  const subject = subjects[0].SPDXID;
  requireThat(
    (doc.relationships ?? []).some(
      (r) =>
        r.spdxElementId === doc.SPDXID &&
        r.relationshipType === "DESCRIBES" &&
        r.relatedSpdxElement === subject,
    ),
    "Document must describe the qualified image",
  );
  for (const expected of coverage[service]) {
    const matches = packages.filter(
      (p) =>
        p.name === expected.name &&
        (!expected.version || p.versionInfo === expected.version) &&
        p.externalRefs?.some(
          (r) => {
            if (r.referenceCategory !== "PACKAGE-MANAGER" || r.referenceType !== "purl" ||
                !r.referenceLocator.startsWith(expected.purl_prefix)) return false;
            const value = r.referenceLocator.split(/[?#]/)[0];
            const at = value.lastIndexOf("@");
            if (at < expected.purl_prefix.length) return false;
            const name = decodeURIComponent(value.slice(expected.purl_prefix.length, at));
            const version = decodeURIComponent(value.slice(at + 1));
            return (name === p.name || name.endsWith("/" + p.name)) && version === p.versionInfo;
          },
        ),
    );
    requireThat(
      matches.length > 0,
      `Missing ${service} representative package: ${expected.name}`,
    );
    requireThat(
      matches.some((p) =>
        (doc.relationships ?? []).some(
          (r) =>
            r.spdxElementId === subject &&
            r.relationshipType === "CONTAINS" &&
            r.relatedSpdxElement === p.SPDXID,
        ),
      ),
      "Required package is not contained by image",
    );
  }
  return checksum(file);
}
export function evidence(dir, withImages = false) {
  const q = read(path.join(dir, "qualification.json"));
  qualification(q);
  const e = read(path.join(dir, "evidence.json"));
  base(e, "evidence");
  requireThat(
    e.qualification_sha256 === checksum(path.join(dir, "qualification.json")) &&
      e.version === q.version &&
      e.source_commit === q.source_commit &&
      JSON.stringify(e.workflow) === JSON.stringify(q.workflow),
    "Evidence/qualification mismatch",
  );
  requireThat(
    e.generation === "passed" &&
      e.format === "SPDX-2.3" &&
      e.scanner.version === pin.version &&
      e.scanner.binary_sha256 === pin.binary_sha256 &&
      e.scanner.configuration_sha256 === pin.configuration_sha256 &&
      e.scanner.toolchain_sha256 ===
        checksum(path.join(root, "sbom/toolchain.json")) &&
      e.scanner.coverage_sha256 ===
        checksum(path.join(root, "sbom/coverage.json")) &&
      e.gateway_limitation === coverage.gateway_limitation,
    "Invalid scanner/coverage evidence",
  );
  for (const service of services) {
    requireThat(
      e.images[service].id === q.images[service].id &&
        e.images[service].sbom === `${service}.spdx.json` &&
        e.images[service].coverage === "passed" &&
        hash.test(e.images[service].sha256),
      "Invalid component evidence",
    );
    const scan = read(path.join(dir, `${service}.scan.json`));
    requireThat(
      scan.config_digest === q.images[service].id &&
        scan.sbom_sha256 === e.images[service].sha256 &&
        checksum(path.join(dir, `${service}.scan.json`)) ===
          e.images[service].scan_sha256,
      "Scan source binding mismatch",
    );
    requireThat(
      sbom(
        path.join(dir, `${service}.spdx.json`),
        service,
        e.images[service].id,
        scan.local_manifest_digest,
      ) === e.images[service].sha256,
      "SBOM checksum mismatch",
    );
  }
  const expectedChecksums = services
    .map((s) => `${e.images[s].sha256}  ${s}.spdx.json\n`)
    .join("");
  requireThat(
    fs.readFileSync(path.join(dir, "checksums.txt"), "utf8") ===
      expectedChecksums,
    "Checksum list mismatch",
  );
  if (withImages) inspect(q);
  return { q, e };
}
// Read-only signing boundary: no local images and no receipt mutation.
export function publication(dir) {
  const { q, e } = evidence(dir, false);
  const p = read(path.join(dir, "publication.json"));
  base(p, "publication");
  requireThat(
    p.publication === "verified" && p.qualification === "passed" && e.qualification === "passed" &&
      p.evidence_sha256 === checksum(path.join(dir, "evidence.json")) &&
      p.version === q.version && p.source_commit === q.source_commit &&
      p.platform === q.platform &&
      JSON.stringify(p.workflow) === JSON.stringify(q.workflow),
    "Publication chain mismatch or incomplete publication",
  );
  for (const s of services) {
    const image = p.images[s];
    requireThat(
      Object.entries(e.images[s]).every(([k, v]) => image[k] === v) &&
        digest.test(image.manifest_digest) &&
        image.config_digest === q.images[s].id &&
        image.ref === `${image.repository}:${q.version}` &&
        image.digest_pinned_identity === "passed" && image.anonymous === "passed",
      "Publication image mapping mismatch",
    );
  }
  return p;
}
export function state(dir, component, value) {
  const file = path.join(dir, "attempt-status.json");
  const status = fs.existsSync(file)
    ? read(file)
    : {
        schema,
        stage: "attempt-status",
        publication: "not_started",
        images: {},
      };
  if (["publication", "delivery"].includes(component))
    status[component] = value;
  else status.images[component] = value;
  // Attempts are isolated and status writes are serial. A killed writer may leave
  // its private sibling behind, but must not block subsequent failure diagnostics.
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  let owned = false;
  try {
    const fd = fs.openSync(temporary, "wx", 0o600);
    owned = true;
    try {
      fs.writeFileSync(fd, `${JSON.stringify(status, null, 2)}\n`);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, file);
  } finally {
    if (owned && fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
export function generate(qualificationFile, dir, binary) {
  const q = read(qualificationFile);
  qualification(q);
  inspect(q);
  requireThat(
    checksum(binary) === pin.binary_sha256,
    "Scanner executable checksum mismatch",
  );
  requireThat(
    checksum(path.join(root, "sbom/syft.yaml")) === pin.configuration_sha256,
    "Scanner configuration changed",
  );
  const endpoint = docker(
    "context",
    "inspect",
    "--format",
    "{{.Endpoints.docker.Host}}",
  );
  requireThat(
    endpoint.startsWith("unix:///") && !process.env.DOCKER_HOST,
    "Only local Docker context without DOCKER_HOST override is supported",
  );
  fs.mkdirSync(dir, { mode: 0o700 }); // Existing evidence never gets overwritten.
  fs.copyFileSync(
    qualificationFile,
    path.join(dir, "qualification.json"),
    fs.constants.COPYFILE_EXCL,
  );
  const privateDir = fs.mkdtempSync(
    path.join(path.dirname(dir), ".verilio-scanner-"),
  );
  const env = {
    PATH: process.env.PATH,
    HOME: privateDir,
    XDG_CONFIG_HOME: privateDir,
    DOCKER_CONFIG: privateDir,
    DOCKER_HOST: endpoint,
  };
  try {
    const version = JSON.parse(
      execFileSync(binary, ["version", "-o", "json"], {
        env,
        encoding: "utf8",
        timeout: 30000,
      }),
    );
    requireThat(version.version === pin.version, "Scanner version mismatch");
    for (const service of services) {
      state(dir, service, "scanning");
      const fd = fs.openSync(
        path.join(privateDir, `${service}.stderr`),
        "wx",
        0o600,
      );
      let result;
      try {
        result = spawnSync(
          "bash",
          [
            "-c",
            'ulimit -f 102400; exec "$@"',
            "verilio-sbom",
            binary,
            "scan",
            "--from",
            "docker",
            q.images[service].id,
            "--scope",
            pin.scope,
            "--config",
            path.join(root, "sbom/syft.yaml"),
            "--override-default-catalogers",
            pin.catalogers.join(","),
            "-o",
            `${pin.format}=${path.join(privateDir, `${service}.spdx.json`)}`,
            "-o",
            `syft-json=${path.join(privateDir, `${service}.native.json`)}`,
          ],
          {
            env,
            timeout: pin.timeout_seconds * 1000,
            stdio: ["ignore", "ignore", fd],
          },
        );
      } finally {
        fs.closeSync(fd);
      }
      // Raw logs remain private and are never an upload source. Safe status is sufficient.
      if (result.status !== 0 || result.error) {
        state(dir, service, `scan_failed_exit_${result.status ?? "signal"}`);
        throw new Error(
          `${service} scanner failed (exit ${result.status ?? "signal"}); private diagnostics retained, not uploaded`,
        );
      }
      const native = read(path.join(privateDir, `${service}.native.json`));
      const meta = native.source?.metadata;
      requireThat(
        native.source?.type === "image" &&
          meta?.imageID === q.images[service].id &&
          meta.userInput === q.images[service].id &&
          `${meta.os}/${meta.architecture}` === q.platform &&
          digest.test(meta.manifestDigest),
        "Scanner substituted image source",
      );
      const scanned = path.join(privateDir, `${service}.spdx.json`);
      const sum = sbom(
        scanned,
        service,
        q.images[service].id,
        meta.manifestDigest,
      );
      fs.copyFileSync(
        scanned,
        path.join(dir, `${service}.spdx.json`),
        fs.constants.COPYFILE_EXCL,
      );
      issue(path.join(dir, `${service}.scan.json`), {
        config_digest: meta.imageID,
        local_manifest_digest: meta.manifestDigest,
        sbom_sha256: sum,
      });
      state(dir, service, "scan_validated");
    }
    inspect(q);
    main(["accept", dir]);
  } catch (error) {
    state(dir, "publication", "blocked_evidence_failure");
    throw error;
  }
}
function main([command, ...args]) {
  if (command === "generate") {
    requireThat(
      args.length === 3,
      "Expected qualification, new output directory, pinned Syft executable",
    );
    generate(...args);
  } else if (command === "install-scanner") {
    requireThat(args.length === 1, "Expected new scanner directory");
    fs.mkdirSync(args[0], { mode: 0o700 });
    const archive = path.join(args[0], "syft.tar.gz");
    execFileSync("curl", [
      "--fail",
      "--location",
      "--proto",
      "=https",
      "--tlsv1.2",
      "--max-time",
      "180",
      "--output",
      archive,
      pin.url,
    ]);
    requireThat(
      checksum(archive) === pin.archive_sha256,
      "Scanner archive checksum mismatch",
    );
    execFileSync("tar", ["-xzf", archive, "-C", args[0], "syft"]);
    requireThat(
      checksum(path.join(args[0], "syft")) === pin.binary_sha256,
      "Scanner binary checksum mismatch",
    );
  } else if (command === "capture") {
    const [version, commit, api, gateway, output] = args;
    const record = {
      schema,
      stage: "candidate",
      version,
      source_commit: commit,
      platform: "linux/amd64",
      workflow: {
        repository: process.env.GITHUB_REPOSITORY,
        ref: process.env.GITHUB_WORKFLOW_REF,
        commit: process.env.GITHUB_WORKFLOW_SHA,
        run_id: process.env.GITHUB_RUN_ID,
        run_attempt: process.env.GITHUB_RUN_ATTEMPT,
        job: process.env.GITHUB_JOB,
      },
      images: Object.fromEntries(
        services.map((s, i) => [
          s,
          {
            repository: `ghcr.io/andresz74/verilio-${s}`,
            id: [api, gateway][i],
          },
        ]),
      ),
    };
    base(record, "candidate");
    inspect(record);
    issue(output, record);
  } else if (command === "check-candidate" || command === "qualify") {
    const r = read(args[0]);
    base(r, "candidate");
    inspect(r);
    if (command === "qualify")
      issue(args[1], { ...r, stage: "qualification", qualification: "passed" });
  } else if (command === "container") {
    const r = read(args[0]);
    base(r, "candidate");
    requireThat(
      ["api", "migrate", "gateway"].includes(args[1]),
      "Unknown qualification service",
    );
    const actual = docker("inspect", "--format", "{{.Image}}", args[2]);
    requireThat(
      actual === r.images[args[1] === "migrate" ? "api" : args[1]].id,
      "Qualification container image mismatch",
    );
  } else if (command === "validate") {
    requireThat(
      !fs.existsSync(path.join(args[0], "publication.json")),
      "Publication receipt already exists; no automatic republication",
    );
    const { q } = evidence(args[0], true);
    requireThat(
      q.version === args[1] && q.source_commit === args[2],
      "Publisher source mismatch",
    );
  } else if (command === "accept") {
    const dir = args[0],
      q = read(path.join(dir, "qualification.json"));
    qualification(q);
    inspect(q);
    requireThat(
      checksum(path.join(root, "sbom/syft.yaml")) === pin.configuration_sha256,
      "Scanner configuration changed",
    );
    const images = Object.fromEntries(
      services.map((s) => [
        s,
        {
          ...q.images[s],
          sbom: `${s}.spdx.json`,
          sha256: sbom(
            path.join(dir, `${s}.spdx.json`),
            s,
            q.images[s].id,
            read(path.join(dir, `${s}.scan.json`)).local_manifest_digest,
          ),
          scan_sha256: checksum(path.join(dir, `${s}.scan.json`)),
          coverage: "passed",
        },
      ]),
    );
    fs.writeFileSync(
      path.join(dir, "checksums.txt"),
      services.map((s) => `${images[s].sha256}  ${s}.spdx.json\n`).join(""),
      { flag: "wx" },
    );
    issue(path.join(dir, "evidence.json"), {
      ...q,
      stage: "evidence",
      qualification_sha256: checksum(path.join(dir, "qualification.json")),
      images,
      format: "SPDX-2.3",
      scanner: {
        version: pin.version,
        binary_sha256: pin.binary_sha256,
        configuration_sha256: pin.configuration_sha256,
        toolchain_sha256: checksum(path.join(root, "sbom/toolchain.json")),
        coverage_sha256: checksum(path.join(root, "sbom/coverage.json")),
      },
      gateway_limitation: coverage.gateway_limitation,
      generation: "passed",
    });
  } else if (command === "publish-receipt") {
    const [dir, api, gateway] = args,
      { q, e } = evidence(dir, true);
    requireThat(
      digest.test(api) && digest.test(gateway),
      "Missing remote manifest digest",
    );
    const status = read(path.join(dir, "attempt-status.json"));
    requireThat(
      services.every((s) => status.images[s] === "anonymous_verified"),
      "Publication is incomplete",
    );
    issue(path.join(dir, "publication.json"), {
      ...q,
      stage: "publication",
      evidence_sha256: checksum(path.join(dir, "evidence.json")),
      images: Object.fromEntries(
        services.map((s, i) => [
          s,
          {
            ...e.images[s],
            ref: `${q.images[s].repository}:${q.version}`,
            manifest_digest: [api, gateway][i],
            config_digest: q.images[s].id,
            digest_pinned_identity: "passed",
            anonymous: "passed",
          },
        ]),
      ),
      publication: "verified",
    });
    state(dir, "publication", "verified");
  } else if (command === "validate-publication") {
    requireThat(args.length === 1, "Expected completed evidence directory");
    console.log(JSON.stringify(publication(args[0])));
  } else if (command === "status") state(...args);
  else throw new Error("Unknown release-evidence command");
}
if (
  process.argv[1] &&
  fs.existsSync(process.argv[1]) &&
  fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`Release evidence rejected: ${error.message}`);
    process.exitCode = 1;
  }
}
