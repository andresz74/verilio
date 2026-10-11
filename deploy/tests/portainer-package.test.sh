#!/usr/bin/env bash
# Offline metadata/Compose checks and disposable bootstrap state; no Portainer/daemon.
set -euo pipefail
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
work_root=$(mktemp -d "${TMPDIR:-/tmp}/verilio-portainer-test.XXXXXX")
trap 'rm -rf "$work_root"' EXIT
bootstrap="$repo_root/deploy/portainer/bootstrap.sh"
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
export LOCAL_USER_ID=12345678-1234-4567-8123-123456789abc VERILIO_GATEWAY_HOST_IP=192.168.56.3
unset VERILIO_GATEWAY_PORT LOG_LEVEL
docker compose -f "$repo_root/deploy/portainer/docker-compose.yml" config --format json > "$work_root/config.json"
pass 'Compose config parses without external state files or Docker daemon'

ruby - "$repo_root" "$work_root/config.json" "$passed" > "$work_root/structural.log" <<'RUBY'
require 'yaml'
require 'json'
root, config_path, count = ARGV
passed = count.to_i
read = ->(path) { YAML.safe_load(File.read(path), aliases: true) }
source = read.call(File.join(root, 'deploy/portainer/docker-compose.yml'))
canonical = read.call(File.join(root, 'compose.prod.yml'))
config = JSON.parse(File.read(config_path))
check = lambda do |name, condition|
  abort "not ok - #{name}" unless condition
  passed += 1
  puts "ok #{passed} - #{name}"
end
services = config.fetch('services')
check.call('Standalone package identity has no CasaOS metadata', source['name'] == 'verilio-portainer' && !source.key?('x-casaos'))
check.call('API/migrate use exact official alpha.5 images', %w[api migrate].all? { |name| services[name]['image'] == 'ghcr.io/andresz74/verilio-api:v0.1.1-alpha.5' })
check.call('Gateway uses exact official alpha.5 image', services['gateway']['image'] == 'ghcr.io/andresz74/verilio-gateway:v0.1.1-alpha.5')
check.call('PostgreSQL stays pinned to 17.9-alpine', services['postgres']['image'] == 'postgres:17.9-alpine')
check.call('no service has an image build', services.values.none? { |service| service.key?('build') })
check.call('image tags have no floating aliases', services.values.all? { |service| service['image'].match?(/:(v0\.1\.1-alpha\.5|17\.9-alpine)\z/) })
check.call('API has no host port', services['api'].fetch('ports', []).empty?)
check.call('PostgreSQL has no host port', services['postgres'].fetch('ports', []).empty?)
check.call('Gateway requires explicit host IP without wildcard default', source['services']['gateway']['ports'] == ['${VERILIO_GATEWAY_HOST_IP:?set trusted private host IP}:${VERILIO_GATEWAY_PORT:-8080}:8080'])
check.call('Gateway resolves one selected private IP and default port 8080', services['gateway']['ports'].length == 1 && services['gateway']['ports'][0].values_at('host_ip', 'published', 'target') == ['192.168.56.3', '8080', 8080])
postgres_bind = {'type'=>'bind', 'source'=>'/var/lib/verilio-portainer/postgres', 'target'=>'/var/lib/postgresql/data', 'bind'=>{'create_host_path'=>false}}
init_bind = {'type'=>'bind', 'source'=>'/var/lib/verilio-portainer/support/init-app-role.sh', 'target'=>'/docker-entrypoint-initdb.d/10-verilio-app-role.sh', 'read_only'=>true, 'bind'=>{'create_host_path'=>false}}
check.call('external PostgreSQL bind requires pre-existing bootstrap data directory', source['services']['postgres']['volumes'].include?(postgres_bind))
check.call('canonical initializer uses long read-only bind without auto-creating paths', source['services']['postgres']['volumes'].include?(init_bind))
check.call('file-backed secrets use exact absolute host paths', %w[database_url postgres_admin_password postgres_app_password].all? { |name| config['secrets'][name]['file'] == "/var/lib/verilio-portainer/secrets/#{name}" })
check.call('Verilio state uses no Docker named volumes', !source.key?('volumes') && services.values.all? { |service| service.fetch('volumes', []).all? { |mount| mount['type'] == 'bind' } })
check.call('migrate preserves canonical restart no', source['services']['migrate']['restart'] == 'no' && services['migrate']['restart'] == 'no')
check.call('API waits for successful one-shot migration', services['api']['depends_on']['migrate']['condition'] == 'service_completed_successfully')
check.call('owner is required and identical for API/migrate with default info log level', %w[api migrate].all? { |name| source['services'][name]['environment']['LOCAL_USER_ID'] == '${LOCAL_USER_ID:?set LOCAL_USER_ID in Portainer stack environment}' && services[name]['environment']['LOCAL_USER_ID'] == '12345678-1234-4567-8123-123456789abc' && services[name]['environment']['LOG_LEVEL'] == 'info' })
check.call('no host env_file or credentials in stack environment', source['services'].values.all? { |service| !service.key?('env_file') && service.fetch('environment', {}).keys.none? { |key| key == 'DATABASE_URL' || key == 'POSTGRES_PASSWORD' || key == 'POSTGRES_APP_PASSWORD' } } && %w[api migrate].all? { |name| services[name]['environment']['DATABASE_URL_FILE'] == '/run/secrets/database_url' })
check.call('generic Compose remains loopback-only with API/PostgreSQL unpublished', canonical['services']['gateway']['ports'] == ['127.0.0.1:${VERILIO_GATEWAY_PORT:-8080}:8080'] && %w[api postgres].all? { |name| !canonical['services'][name].key?('ports') })
expected = Marshal.load(Marshal.dump(canonical))
expected['name'] = 'verilio-portainer'
expected.delete('volumes')
%w[api migrate].each do |name|
  expected['services'][name]['image'] = 'ghcr.io/andresz74/verilio-api:v0.1.1-alpha.5'
  expected['services'][name]['environment']['LOCAL_USER_ID'] = '${LOCAL_USER_ID:?set LOCAL_USER_ID in Portainer stack environment}'
  expected['services'][name]['environment']['LOG_LEVEL'] = '${LOG_LEVEL:-info}'
end
expected['services']['gateway']['image'] = 'ghcr.io/andresz74/verilio-gateway:v0.1.1-alpha.5'
expected['services']['gateway']['ports'] = source['services']['gateway']['ports']
expected['services']['api']['environment']['API_PORT'] = '3000'
expected['services']['postgres']['volumes'] = [postgres_bind, init_bind]
expected['secrets'].each { |name, secret| secret['file'] = "/var/lib/verilio-portainer/secrets/#{name}" }
check.call('all remaining health/tuning/checksums/hardening/logging/network/order fields match canonical runtime', source == expected)
guide = File.read(File.join(root, 'deploy/portainer/README.md'))
check.call('guide preserves portable private-address boot readiness requirement', guide.gsub(/\s+/, ' ').include?('before Docker restores containers') && guide.include?('stable address or DHCP') && guide.include?('network-online.target'))
check.call('guide scopes boot-managed interface example to Debian ifupdown', guide.include?('Debian ifupdown') && guide.include?('auto <private-interface>') && guide.include?('iface <private-interface> inet dhcp') && guide.include?('not guidance for every distribution'))
check.call('guide preserves recreation recovery and rejects wildcard workaround', guide.include?('docker start <container>') && guide.include?('recreated after') && guide.include?('Do not use `0.0.0.0` as a workaround'))
puts passed
RUBY
passed=$(tail -n 1 "$work_root/structural.log")
sed '$d' "$work_root/structural.log"

for required in LOCAL_USER_ID VERILIO_GATEWAY_HOST_IP; do
  if env -u "$required" docker compose -f "$repo_root/deploy/portainer/docker-compose.yml" config > "$work_root/error" 2>&1; then fail "missing $required accepted"; fi
  grep -q "$required" "$work_root/error" || fail "missing $required diagnostic"
  pass "Compose refuses missing $required"
done
VERILIO_GATEWAY_PORT=18085 LOG_LEVEL=debug docker compose -f "$repo_root/deploy/portainer/docker-compose.yml" config --format json > "$work_root/custom.json"
node - "$work_root/custom.json" <<'NODE'
const assert = require('node:assert/strict');
const config = require(process.argv[2]);
assert.equal(config.services.gateway.ports[0].published, '18085');
for (const name of ['api', 'migrate']) assert.equal(config.services[name].environment.LOG_LEVEL, 'debug');
NODE
pass 'explicit port/log level overrides resolve without changing owner or secrets'

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

reject_state() {
  local name=$1 state="$work_root/reject-$1"
  cp -Rp "$work_root/state" "$state"
  case "$name" in
    password) chmod 0600 "$state/secrets/postgres_admin_password"; printf 'invalid\n' > "$state/secrets/postgres_admin_password"; chmod 0444 "$state/secrets/postgres_admin_password" ;;
    duplicate-password) chmod 0600 "$state/secrets/postgres_admin_password"; cp "$state/secrets/postgres_app_password" "$state/secrets/postgres_admin_password"; chmod 0444 "$state/secrets/postgres_admin_password" ;;
    url) chmod 0600 "$state/secrets/database_url"; printf 'invalid\n' > "$state/secrets/database_url"; chmod 0444 "$state/secrets/database_url" ;;
    support) chmod 0600 "$state/support/init-app-role.sh"; printf '# unexpected\n' >> "$state/support/init-app-role.sh"; chmod 0555 "$state/support/init-app-role.sh" ;;
    extra-support) printf '# unexpected\n' > "$state/support/other.sh" ;;
    pg-version) printf '16\n' > "$state/postgres/PG_VERSION" ;;
    partial-postgres) touch "$state/postgres/partial" ;;
    directory-permissions) chmod 0755 "$state/secrets" ;;
    missing-secret) mv "$state/secrets/database_url" "$work_root/missing-url" ;;
    symlink-file) mv "$state/config/runtime.env" "$work_root/linked-env"; ln -s "$work_root/linked-env" "$state/config/runtime.env" ;;
  esac
  cp -Rp "$state" "$work_root/before-$name"
  if (prepare_state "$state") > "$work_root/error" 2>&1; then fail "accepted invalid $name state"; fi
  diff -r "$work_root/before-$name" "$state"
  pass "bootstrap refuses $name without repairing or regenerating state"
}
for invalid in password duplicate-password url support extra-support pg-version partial-postgres directory-permissions missing-secret symlink-file; do reject_state "$invalid"; done
printf '17\n' > "$work_root/state/postgres/PG_VERSION"
prepare_state "$work_root/state" > "$work_root/rerun.log"
pass 'existing PostgreSQL 17 state is accepted without rewriting owner/secrets'

[[ $(wc -l < "$TEST_LOG" | tr -d ' ') == 4 ]] || fail 'unexpected external operation'
pass 'only daemon-free Compose config ran; no pull/build/login/network operations'
echo "$passed Portainer package tests passed."
