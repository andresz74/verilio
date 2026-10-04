#!/usr/bin/env bash
# Package fixtures and Compose config only; never builds/pulls/runs images.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
work_root=$(mktemp -d "${TMPDIR:-/tmp}/verilio-self-host-package-test.XXXXXX")
work_root=$(cd "$work_root" && pwd -P)
trap 'rm -rf "$work_root"' EXIT
exporter="$repo_root/deploy/export-self-host-package.sh"
version=v9.8.7-test
api_repository=registry.example.invalid/verilio-api
gateway_repository=registry.example.invalid/verilio-gateway
package_dir="$work_root/output/verilio-$version-self-host"
passed=0
pass() { passed=$((passed + 1)); echo "ok $passed - $*"; }
fail() { echo "not ok - $*" >&2; exit 1; }
reject() {
  if "$exporter" "$@" >"$work_root/error" 2>&1; then
    fail "unexpected export success: $*"
  fi
}

# Guard every Docker invocation, and prove config works without a daemon.
real_docker=$(command -v docker)
export REAL_DOCKER=$real_docker TEST_LOG="$work_root/external.log"
mkdir "$work_root/bin"
cat >"$work_root/bin/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >>"$TEST_LOG"
if [[ "${1:-}" == compose && " $* " == *' config '* ]]; then
  exec "$REAL_DOCKER" "$@"
fi
echo 'Only docker compose config is permitted.' >&2
exit 1
EOF
cat >"$work_root/bin/forbidden" <<'EOF'
#!/usr/bin/env bash
echo "forbidden $0 $*" >>"$TEST_LOG"
exit 1
EOF
chmod +x "$work_root/bin/docker" "$work_root/bin/forbidden"
for command_name in sudo curl wget ssh; do
  ln -s forbidden "$work_root/bin/$command_name"
done
export PATH="$work_root/bin:$PATH"
: >"$TEST_LOG"

"$exporter" "$version" "$api_repository" "$gateway_repository" "$work_root/output" >"$work_root/result"
[[ "$(cat "$work_root/result")" == "$package_dir" ]] || fail 'wrong exported path'
[[ ! -s "$TEST_LOG" ]] || fail 'export invoked Docker/network/sudo'
pass 'valid export succeeds without Docker, network or sudo'

node - "$package_dir" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
function files(dir, prefix = '') {
  return fs.readdirSync(dir).flatMap(name => fs.statSync(path.join(dir, name)).isDirectory()
    ? files(path.join(dir, name), `${prefix}${name}/`) : [`${prefix}${name}`]);
}
assert.deepEqual(files(root).sort(), [
  'SELF_HOSTING.md', 'compose.yml', 'deploy/postgres/init-app-role.sh',
  'deploy/smoke-test.sh', 'verilio.env.example',
].sort());
NODE
pass 'exact package tree exists with no generated secrets or credentials'

cmp "$repo_root/compose.prod.yml" "$package_dir/compose.yml" || fail 'canonical Compose diverged'
pass 'Compose copy is byte-for-byte canonical'

node - "$package_dir/verilio.env.example" "$version" "$api_repository" "$gateway_repository" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const [file, version, api, gateway] = process.argv.slice(2);
const entries = fs.readFileSync(file, 'utf8').split('\n').filter(line => line && !line.startsWith('#'));
const env = Object.fromEntries(entries.map(line => line.split(/=(.*)/s).slice(0, 2)));
assert.equal(entries.length, Object.keys(env).length);
assert.deepEqual(env, {
  COMPOSE_PROJECT_NAME: 'verilio', VERILIO_VERSION: version,
  VERILIO_API_IMAGE: api, VERILIO_GATEWAY_IMAGE: gateway,
  LOCAL_USER_ID: '00000000-0000-4000-8000-000000000001', LOG_LEVEL: 'info',
  VERILIO_GATEWAY_PORT: '8080', VERILIO_PGDATA_VOLUME: 'verilio_pgdata',
  VERILIO_DATABASE_URL_SECRET: './secrets/database_url',
  VERILIO_POSTGRES_ADMIN_PASSWORD_SECRET: './secrets/postgres_admin_password',
  VERILIO_POSTGRES_APP_PASSWORD_SECRET: './secrets/postgres_app_password',
});
NODE
pass 'env contains exact explicit identity, stable owner placeholder and relative secret paths'

config() {
  env -i PATH="$PATH" HOME="$HOME" REAL_DOCKER="$REAL_DOCKER" TEST_LOG="$TEST_LOG" \
    DOCKER_HOST="unix://$work_root/no-daemon.sock" docker compose \
    --env-file "$package_dir/verilio.env.example" -f "$package_dir/compose.yml" config --format json
}
assert_config() {
  config >"$work_root/config.json"
  node - "$work_root/config.json" "$package_dir" "$api_repository" "$gateway_repository" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const [file, root, api, gateway] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
assert.equal(config.services.api.image, `${api}:v9.8.7-test`);
assert.equal(config.services.migrate.image, `${api}:v9.8.7-test`);
assert.equal(config.services.gateway.image, `${gateway}:v9.8.7-test`);
assert.equal(config.services.postgres.image, 'postgres:17.9-alpine');
for (const name of ['database_url', 'postgres_admin_password', 'postgres_app_password']) {
  assert.equal(config.secrets[name].file, path.join(root, 'secrets', name));
}
const init = config.services.postgres.volumes.find(volume => volume.type === 'bind');
assert.equal(init.source, path.join(root, 'deploy/postgres/init-app-role.sh'));
assert.equal(init.target, '/docker-entrypoint-initdb.d/10-verilio-app-role.sh');
assert.equal(init.read_only, true);
assert.ok(fs.existsSync(init.source));
assert.equal(config.services.gateway.ports[0].host_ip, '127.0.0.1');
assert.equal(config.services.api.depends_on.migrate.condition, 'service_completed_successfully');
assert.equal(config.volumes.verilio_pgdata.name, 'verilio_pgdata');
NODE
}
assert_config
pass 'Compose resolves requested images, pinned PostgreSQL, init/secret paths and runtime ordering without daemon'

# Moving the package and invoking from elsewhere must retain portable paths.
mkdir "$work_root/relocated package" "$work_root/unrelated"
mv "$package_dir" "$work_root/relocated package/"
package_dir="$work_root/relocated package/verilio-$version-self-host"
(cd "$work_root/unrelated"; assert_config)
pass 'relocated package resolves secrets and init mount from Compose directory, not caller cwd'

for helper in deploy/smoke-test.sh deploy/postgres/init-app-role.sh; do
  cmp "$repo_root/$helper" "$package_dir/$helper" || fail "changed $helper"
  [[ -x "$package_dir/$helper" ]] || fail "not executable: $helper"
done
pass 'smoke and PostgreSQL init helpers retain content and executable permissions'

reject
reject '' "$api_repository" "$gateway_repository" "$work_root/missing-version"
pass 'missing/empty version fails'
reject latest "$api_repository" "$gateway_repository" "$work_root/latest"
pass 'latest version fails'
reject "$version"
reject "$version" '' "$gateway_repository" "$work_root/missing-api"
pass 'missing/empty API repository fails'
reject "$version" "$api_repository"
reject "$version" "$api_repository" '' "$work_root/missing-gateway"
pass 'missing/empty Gateway repository fails'

cp "$package_dir/verilio.env.example" "$work_root/before.env"
echo sentinel >"$package_dir/sentinel"
reject "$version" other-api other-gateway "$work_root/relocated package"
cmp "$work_root/before.env" "$package_dir/verilio.env.example" || fail 'existing env overwritten'
[[ "$(cat "$package_dir/sentinel")" == sentinel ]] || fail 'existing package overwritten'
pass 'existing target package is not overwritten'

mkdir "$work_root/symlink-output"
ln -s "$work_root/missing-target" "$work_root/symlink-output/verilio-$version-self-host"
reject "$version" "$api_repository" "$gateway_repository" "$work_root/symlink-output"
[[ ! -e "$work_root/missing-target" ]] || fail 'dangling symlink followed'
pass 'existing dangling symlink target is refused'

if grep -R -E ':latest|VERILIO_VERSION=latest' "$package_dir"; then fail 'latest default in package'; fi
pass 'no package file defaults to latest'
if grep -R -E 'ghcr[.]io' "$package_dir" "$repo_root/deploy/SELF_HOSTING.md" "$exporter"; then
  fail 'registry namespace introduced in package/template'
fi
pass 'package and templates remain registry-neutral'

for repository in 'registry/foo:tag/bar' 'api/' 'api//path' 'api:tag' 'api@sha256:digest' 'api name' 'api#comment' 'api${OVERRIDE}' $'api\nINJECTED=value'; do
  reject "$version" "$repository" "$gateway_repository" "$work_root/invalid"
done
reject '../escape' "$api_repository" "$gateway_repository" "$work_root/invalid"
[[ ! -e "$work_root/invalid" ]] || fail 'invalid input mutated output'
pass 'tagged/digest/unsafe env inputs and invalid version fail before writes'

"$exporter" "$version" "$api_repository" "$gateway_repository" "$work_root/repeat" >/dev/null
rm "$package_dir/sentinel"
diff -r "$package_dir" "$work_root/repeat/verilio-$version-self-host" || fail 'nondeterministic package content'
pass 'same inputs reproduce identical package contents'

api_repository=registry.example.invalid:5000/verilio-api
gateway_repository=registry.example.invalid:5000/verilio-gateway
"$exporter" "$version" "$api_repository" "$gateway_repository" "$work_root/host-port" >/dev/null
package_dir="$work_root/host-port/verilio-$version-self-host"
assert_config
pass 'registry host ports remain separate from explicit version tags'

echo "$passed self-host package tests passed."
