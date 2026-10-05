# Offline structural YAML validation using Ruby's standard library (no gems).
require 'yaml'
require 'open3'

root = File.expand_path('../..', __dir__)
path = File.join(root, '.github/workflows/publish-images.yml')
text = File.read(path)
workflow = YAML.safe_load(text)
# Psych's YAML 1.1 parser treats the GitHub Actions `on` key as boolean true.
triggers = workflow['on'] || workflow[true]
passed = 0
check = lambda do |description, condition|
  abort "not ok - #{description}" unless condition
  passed += 1
  puts "ok #{passed} - #{description}"
end
check.call('v* push trigger and required string dispatch version',
  triggers['push']['tags'] == ['v*'] &&
  triggers['workflow_dispatch']['inputs']['version']['required'] == true &&
  triggers['workflow_dispatch']['inputs']['version']['type'] == 'string')
check.call('only contents read / packages write permissions',
  workflow['permissions'] == { 'contents' => 'read', 'packages' => 'write' })
concurrency = workflow['concurrency']
check.call('version-keyed concurrency never cancels an active publication',
  concurrency['group'] == 'verilio-publish-${{ inputs.version || github.ref_name }}' &&
  concurrency['cancel-in-progress'] == false)
job = workflow['jobs']['publish']
steps = job['steps']
check.call('canonical repository and amd64-only job',
  job['if'] == "github.repository == 'andresz74/verilio'" &&
  job['env']['VERSION'] == '${{ inputs.version || github.ref_name }}' &&
  job['env']['VERILIO_PLATFORM'] == 'linux/amd64' &&
  job['env']['VERILIO_ALLOW_UNRELEASED_BUILD'] == 'false')
checkout = steps.find { |step| step.fetch('uses', '').start_with?('actions/checkout@') }
check.call('both triggers explicitly check out the exact requested tag, never branch HEAD',
  checkout['with']['ref'] == 'refs/tags/${{ inputs.version || github.ref_name }}' &&
  checkout['with']['fetch-depth'] == 0 && checkout['with']['persist-credentials'] == false)
login_index = steps.index { |step| step.fetch('uses', '').start_with?('docker/login-action@') }
login = steps[login_index]
check.call('GHCR login uses only actor and GITHUB_TOKEN',
  login['with']['registry'] == 'ghcr.io' &&
  login['with']['username'] == '${{ github.actor }}' &&
  login['with']['password'] == '${{ secrets.GITHUB_TOKEN }}' &&
  text.scan(/secrets\.([A-Za-z_][A-Za-z0-9_]*)/).flatten == ['GITHUB_TOKEN'])
before_login = steps[0...login_index].map { |step| step.fetch('run', '') }.join("\n")
commands = [
  './deploy/verify-official-release-source.sh "$VERSION"',
  'pnpm install --frozen-lockfile',
  'pnpm exec playwright install --with-deps chromium',
  'docker compose -f docker-compose.yml up --detach --wait --wait-timeout 90 postgres',
  'pnpm db:migrate', 'pnpm db:generate', 'test -z "$(git status --porcelain)"',
  'pnpm lint', 'pnpm typecheck', 'pnpm test', 'pnpm test:integration',
  'pnpm test:e2e', 'pnpm test:deploy', 'pnpm build',
  './deploy/build-release.sh "$VERSION"', './deploy/test-release.sh "$VERSION"',
  './deploy/export-release.sh "$VERSION" "$RUNNER_TEMP/verilio-export"'
]
positions = commands.map { |command| before_login.lines.find_index { |line| line.strip == command } }
check.call('entire source and official build/test/export gate runs in order before login',
  positions.none?(&:nil?) && positions == positions.sort)
check.call('requested version syntax is validated before checkout',
  steps[0]['run'].include?('^v[0-9]+\.[0-9]+\.[0-9]+') && steps.index(checkout) > 0)
check.call('build once, pin pre-gate IDs and compare after testing/export before authentication',
  before_login.scan('./deploy/build-release.sh').length == 1 &&
  before_login.index('api_id=$(docker image inspect') < before_login.index('./deploy/test-release.sh') &&
  before_login.include?('test "$api_id" = "$(docker image inspect') &&
  before_login.include?('test "$gateway_id" = "$(docker image inspect') &&
  before_login.include?('VERILIO_QUALIFIED_API_IMAGE_ID=$api_id') &&
  before_login.include?('VERILIO_QUALIFIED_GATEWAY_IMAGE_ID=$gateway_id'))
after_login = steps[(login_index + 1)..-1].map { |step| step.fetch('run', '') }.join("\n")
check.call('publication invokes helper after login, with no rebuild or floating tags',
  after_login.include?('./deploy/publish-release-images.sh "$VERSION"') &&
  !after_login.match?(/build-release|buildx build|docker build|docker pull|:(latest|alpha|stable|v0\.1|v1)\b/))
cleanup = steps.last
check.call('development PostgreSQL has immediate trap and always cleanup including failures',
  before_login.include?("trap 'docker compose -f docker-compose.yml down --volumes --remove-orphans' EXIT") &&
  cleanup['if'] == 'always()' &&
  cleanup['run'] == 'docker compose -f docker-compose.yml down --volumes --remove-orphans')
check.call('Node matches Dockerfile and pnpm uses packageManager',
  steps.find { |step| step.fetch('uses', '').start_with?('actions/setup-node@') }['with']['node-version'] ==
    File.read(File.join(root, 'deploy/Dockerfile'))[/ARG NODE_IMAGE=node:([0-9.]+)/, 1] &&
  !steps.find { |step| step.fetch('uses', '').start_with?('pnpm/action-setup@') }.key?('with'))
check.call('all third-party actions pinned to full commit SHAs',
  steps.map { |step| step['uses'] }.compact.all? { |uses| uses.match?(/@[0-9a-f]{40}\z/) })
steps.each do |step|
  next unless step['run']
  _, error, status = Open3.capture3('bash', '-n', stdin_data: step['run'])
  abort error unless status.success?
end
check.call('all YAML run blocks have valid Bash syntax', true)
dockerfile = File.read(File.join(root, 'deploy/Dockerfile'))
check.call('both runtime stages preserve title/version/revision and add canonical source label',
  dockerfile.scan('org.opencontainers.image.source="https://github.com/andresz74/verilio"').length == 2 &&
  %w[title version revision].all? { |label| dockerfile.scan("org.opencontainers.image.#{label}=").length == 2 })
puts "#{passed} publishing workflow contract tests passed (offline structural YAML/Bash validation)."
