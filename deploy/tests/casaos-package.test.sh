#!/usr/bin/env bash
# Offline metadata/Compose checks and disposable bootstrap state; no CasaOS/daemon.
set -euo pipefail
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
work_root=$(mktemp -d "${TMPDIR:-/tmp}/verilio-casaos-test.XXXXXX")
trap 'rm -rf "$work_root"' EXIT
bootstrap="$repo_root/deploy/casaos/bootstrap.sh"
passed=0
pass() { passed=$((passed + 1)); echo "ok $passed - $*"; }
fail() { echo "not ok - $*" >&2; exit 1; }

bash -n "$bootstrap"
pass 'bootstrap has valid Bash syntax'

real_docker=$(command -v docker)
export REAL_DOCKER="$real_docker" TEST_LOG="$work_root/operations.log"
mkdir "$work_root/bin"
cat > "$work_root/bin/docker" <<'GUARD'
#!/usr/bin/env bash
printf 'docker %s\n' "$*" >> "$TEST_LOG"
if [[ "${1:-}" == compose && " $* " == *' config '* ]]; then exec "$REAL_DOCKER" "$@"; fi
exit 1
GUARD
cat > "$work_root/bin/forbidden" <<'GUARD'
#!/usr/bin/env bash
printf 'forbidden %s\n' "$0 $*" >> "$TEST_LOG"
exit 1
GUARD
chmod +x "$work_root/bin/"*
for command_name in curl wget ssh sudo; do ln -s forbidden "$work_root/bin/$command_name"; done
export PATH="$work_root/bin:$PATH"
export DOCKER_HOST="unix://$work_root/no-daemon.sock"
: > "$TEST_LOG"
docker compose -f "$repo_root/deploy/casaos/docker-compose.yml" config --no-env-resolution --format json > "$work_root/config.json"
pass 'Compose config parses without external state files or Docker daemon'

ruby - "$repo_root" "$work_root/config.json" "$passed" > "$work_root/structural.log" <<'RUBY'
require 'yaml'
require 'json'
root, config_path, count = ARGV
passed = count.to_i
read = ->(path) { YAML.safe_load(File.read(path), aliases: true) }
source = read.call(File.join(root, 'deploy/casaos/docker-compose.yml'))
canonical = read.call(File.join(root, 'compose.prod.yml'))
config = JSON.parse(File.read(config_path))
check = lambda do |name, condition|
  abort "not ok - #{name}" unless condition
  passed += 1
  puts "ok #{passed} - #{name}"
end
meta = source.fetch('x-casaos')
check.call('current upstream required metadata fields/types and Compose identity',
  source['name'] == 'verilio-casaos' && meta['id'] == 'io.verilio.app' &&
  %w[id main index port_map icon category version].all? { |key| meta[key].is_a?(String) } &&
  meta['title']['en_US'] == 'Verilio' && meta['category'] == 'Productivity' &&
  meta['version'] == '0.1.1-alpha.5' && meta['icon'].end_with?('/apps/web/public/favicon.svg'))
check.call('CasaOS main selects Gateway UI with root HTTP entry', meta['main'] == 'gateway' && meta['index'] == '/' && meta['scheme'] == 'http')
check.call('CasaOS port_map is string 8080 matching the actual published port', meta['port_map'] == '8080' && config['services']['gateway']['ports'][0]['published'] == '8080')
check.call('CasaOS architecture is amd64 only', meta['architectures'] == ['amd64'])
services = config.fetch('services')
check.call('API_PORT is a YAML string safe for CasaOS environment parsing', source['services']['api']['environment']['API_PORT'] == '3000' && services['api']['environment']['API_PORT'] == '3000')
check.call('migrate uses on-failure so successful one-shot exits stay stopped under CasaOS', source['services']['migrate']['restart'] == 'on-failure' && services['migrate']['restart'] == 'on-failure')
check.call('API and migrate use exact official alpha.5 image', %w[api migrate].all? { |name| services[name]['image'] == 'ghcr.io/andresz74/verilio-api:v0.1.1-alpha.5' })
check.call('Gateway uses exact official alpha.5 image', services['gateway']['image'] == 'ghcr.io/andresz74/verilio-gateway:v0.1.1-alpha.5')
check.call('PostgreSQL stays pinned to 17.9-alpine', services['postgres']['image'] == 'postgres:17.9-alpine')
check.call('no service has an image build', services.values.none? { |service| service.key?('build') })
check.call('all image tags are explicit immutable baseline refs, with no floating aliases', services.values.all? { |service| service['image'].match?(/:(v0\.1\.1-alpha\.5|17\.9-alpine)\z/) })
check.call('API has no host port', services['api'].fetch('ports', []).empty?)
check.call('PostgreSQL has no host port', services['postgres'].fetch('ports', []).empty?)
check.call('Gateway source defaults to loopback only', services['gateway']['ports'].length == 1 && services['gateway']['ports'][0]['host_ip'] == '127.0.0.1' && services['gateway']['ports'][0]['target'] == 8080)
mounts = services['postgres']['volumes']
check.call('PostgreSQL uses protected external bind data', mounts.any? { |mount| mount['type'] == 'bind' && mount['source'] == '/DATA/VerilioState/postgres' && mount['target'] == '/var/lib/postgresql/data' })
check.call('canonical init support is an external read-only bind', mounts.any? { |mount| mount['source'] == '/DATA/VerilioState/support/init-app-role.sh' && mount['target'] == '/docker-entrypoint-initdb.d/10-verilio-app-role.sh' && mount['read_only'] })
init_bind = {
  'type' => 'bind',
  'source' => '/DATA/VerilioState/support/init-app-role.sh',
  'target' => '/docker-entrypoint-initdb.d/10-verilio-app-role.sh',
  'read_only' => true
}
check.call('init script uses long bind syntax to preserve read_only through CasaOS', source['services']['postgres']['volumes'].include?(init_bind))
check.call('secrets use exact absolute protected files', %w[database_url postgres_admin_password postgres_app_password].all? { |name| config['secrets'][name]['file'] == "/DATA/VerilioState/secrets/#{name}" })
check.call('API/migrate use the same external owner env_file without embedded owner or credentials', %w[api migrate].all? { |name| source['services'][name]['env_file'] == ['/DATA/VerilioState/config/runtime.env'] && !source['services'][name]['environment'].key?('LOCAL_USER_ID') && !source['services'][name]['environment'].key?('DATABASE_URL') && source['services'][name]['environment']['DATABASE_URL_FILE'] == '/run/secrets/database_url' })
check.call('no Docker named volumes define Verilio state', !source.key?('volumes') && services.values.all? { |service| service.fetch('volumes', []).all? { |mount| mount['type'] == 'bind' } })
check.call('generic Compose remains loopback-only with API/PostgreSQL unpublished', canonical['services']['gateway']['ports'] == ['127.0.0.1:${VERILIO_GATEWAY_PORT:-8080}:8080'] && %w[api postgres].all? { |name| !canonical['services'][name].key?('ports') })

# All runtime fields must match canonical Compose except the reviewed platform adaptations.
expected = Marshal.load(Marshal.dump(canonical))
expected['name'] = 'verilio-casaos'
expected['x-casaos'] = meta
expected.delete('volumes')
%w[api migrate].each do |name|
  expected['services'][name]['image'] = 'ghcr.io/andresz74/verilio-api:v0.1.1-alpha.5'
  expected['services'][name]['env_file'] = ['/DATA/VerilioState/config/runtime.env']
  expected['services'][name]['environment'].delete('LOCAL_USER_ID')
  expected['services'][name]['environment'].delete('LOG_LEVEL')
end
expected['services']['gateway']['image'] = 'ghcr.io/andresz74/verilio-gateway:v0.1.1-alpha.5'
expected['services']['gateway']['ports'] = ['127.0.0.1:8080:8080']
expected['services']['api']['environment']['API_PORT'] = '3000'
expected['services']['migrate']['restart'] = 'on-failure'
expected['services']['postgres']['volumes'] = ['/DATA/VerilioState/postgres:/var/lib/postgresql/data', init_bind]
expected['secrets'].each { |name, secret| secret['file'] = "/DATA/VerilioState/secrets/#{name}" }
check.call('all remaining ordering/health/tuning/hardening/logging/network fields match canonical runtime', source == expected)
puts passed
RUBY
passed=$(tail -n 1 "$work_root/structural.log")
sed '$d' "$work_root/structural.log"

source "$bootstrap"
prepare_state "$work_root/state" > "$work_root/bootstrap.log"
pass 'fresh disposable bootstrap succeeds without root or external operations'
node - "$work_root/state" "$work_root/bootstrap.log" <<'NODE'
const fs = require('node:fs');
const assert = require('node:assert/strict');
const [root, log] = process.argv.slice(2);
const env = fs.readFileSync(`${root}/config/runtime.env`, 'utf8');
assert.match(env, /^LOCAL_USER_ID=[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\nLOG_LEVEL=info\n$/);
const admin = fs.readFileSync(`${root}/secrets/postgres_admin_password`, 'utf8').trim();
const app = fs.readFileSync(`${root}/secrets/postgres_app_password`, 'utf8').trim();
assert.match(admin, /^[0-9a-f]{64}$/);
assert.match(app, /^[0-9a-f]{64}$/);
assert.notEqual(admin, app);
const url = fs.readFileSync(`${root}/secrets/database_url`, 'utf8').trim();
assert.equal(url, `postgresql://verilio_app:${app}@postgres:5432/verilio`);
const output = fs.readFileSync(log, 'utf8');
for (const value of [admin, app, url]) assert.ok(!output.includes(value));
for (const dir of ['', '/config', '/secrets', '/support', '/postgres']) assert.equal(fs.statSync(root + dir).mode & 0o777, 0o700);
assert.equal(fs.statSync(`${root}/config/runtime.env`).mode & 0o777, 0o600);
for (const name of ['database_url', 'postgres_admin_password', 'postgres_app_password']) assert.equal(fs.statSync(`${root}/secrets/${name}`).mode & 0o777, 0o444);
NODE
pass 'bootstrap generates UUID, independent secure passwords and matching URL without printing secrets, with safe permissions'
cmp "$repo_root/deploy/postgres/init-app-role.sh" "$work_root/state/support/init-app-role.sh"
cmp "$repo_root/deploy/postgres/init-app-role.sh" "$package_root/support/init-app-role.sh"
pass 'bundled and installed init script are byte-for-byte canonical'
cp -Rp "$work_root/state" "$work_root/before"
prepare_state "$work_root/state" > "$work_root/rerun.log"
diff -r "$work_root/before" "$work_root/state"
pass 'complete-state rerun preserves all values and files'
mkdir "$work_root/partial"
if (prepare_state "$work_root/partial") > "$work_root/error" 2>&1; then fail 'partial state accepted'; fi
[[ -z $(ls -A "$work_root/partial") ]] || fail 'partial state repaired'
pass 'partial state is refused without regeneration'
cp -Rp "$work_root/state" "$work_root/inconsistent"
chmod 0644 "$work_root/inconsistent/secrets/database_url"
if (prepare_state "$work_root/inconsistent") > "$work_root/error" 2>&1; then fail 'unsafe permissions accepted'; fi
pass 'unsafe existing permissions are refused without repair'
chmod 0444 "$work_root/inconsistent/secrets/database_url"
chmod 0600 "$work_root/inconsistent/config/runtime.env"
printf 'LOCAL_USER_ID=invalid\nLOG_LEVEL=info\n' > "$work_root/inconsistent/config/runtime.env"
if (prepare_state "$work_root/inconsistent") > "$work_root/error" 2>&1; then fail 'invalid owner accepted'; fi
pass 'inconsistent owner is refused without regeneration'
ln -s "$work_root/state" "$work_root/link"
if (prepare_state "$work_root/link") > "$work_root/error" 2>&1; then fail 'symlink state accepted'; fi
pass 'symlinked state root is refused'
if "$bootstrap" unexpected > "$work_root/error" 2>&1; then fail 'invalid CLI accepted'; fi
if [[ $(id -u) != 0 ]]; then
  if "$bootstrap" > "$work_root/error" 2>&1; then fail 'unprivileged CLI accepted'; fi
  grep -q 'root/sudo' "$work_root/error" || fail 'missing root requirement'
fi
pass 'production CLI requires root/sudo and accepts no alternate state path'
[[ $(wc -l < "$TEST_LOG" | tr -d ' ') == 1 ]] || fail 'unexpected external operation'
pass 'only daemon-free Compose config ran; no pull/build/login/network operations'
echo "$passed CasaOS package tests passed."
