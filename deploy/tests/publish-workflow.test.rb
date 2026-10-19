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
  text.scan(/secrets\.([A-Za-z_][A-Za-z0-9_]*)/).flatten.uniq == ['GITHUB_TOKEN'])
before_login = steps[0...login_index].map { |step| step.fetch('run', '') }.join("\n")
commands = [
  './deploy/verify-official-release-source.sh "$VERSION"',
  'pnpm install --frozen-lockfile',
  'pnpm exec playwright install --with-deps chromium',
  'docker compose -f docker-compose.yml up --detach --wait --wait-timeout 90 postgres',
  'pnpm db:migrate', 'pnpm db:generate', 'test -z "$(git status --porcelain)"',
  'pnpm lint', 'pnpm typecheck', 'pnpm test', 'pnpm test:integration',
  'pnpm test:e2e', 'pnpm test:deploy', 'pnpm build',
  './deploy/build-release.sh "$VERSION"', './deploy/test-release.sh "$VERSION" --expected-images "$RUNNER_TEMP/verilio-sbom/candidate.json"',
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
  after_login.include?('--evidence-dir') &&
  !after_login.match?(/build-release|buildx build|docker build|docker pull|:(latest|alpha|stable|v0\.1|v1)\b/))
evidence_upload = steps.index { |step| step['name'] == 'Preserve required pre-publication evidence' }
revalidate = steps.index { |step| step['name'] == 'Revalidate evidence before authentication' }
check.call('paired SBOM gate and mandatory artifact upload precede login',
  evidence_upload < revalidate && revalidate < login_index &&
  steps[evidence_upload]['if'].nil? && steps[evidence_upload]['continue-on-error'].nil? &&
  before_login.include?('./deploy/generate-release-sbom.sh') && before_login.include?('release-evidence.mjs validate'))
uploads = steps.select { |step| step.fetch('uses', '').start_with?('actions/upload-artifact@') }
check.call('bounded explicit artifact allowlist excludes logs and credentials',
  uploads.length == 3 && uploads.all? { |step| step['with']['retention-days'] == 30 && !step['with']['path'].match?(/\*|docker|stderr|scanner/) } &&
  steps[evidence_upload]['with']['if-no-files-found'] == 'error')
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

# Failures in required uploads must follow GitHub's default success-only gating;
# no always()/continue-on-error escape hatch may reach login or publication.
check.call('pre-upload failure cannot reach revalidation, login or publication',
  steps[evidence_upload..steps.index { |s| s['name'] == 'Publish tested images and verify anonymous access' }].all? { |s|
    s['if'].nil? && s['continue-on-error'].nil?
  })
final_upload = steps.find { |s| s['id'] == 'final_evidence' }
delivery = steps.find { |s| s['name'] == 'Record evidence delivery result' }
diagnostics = steps.find { |s| s['name'] == 'Preserve safe attempt diagnostics' }
check.call('final upload failure stays fatal and attempts safe diagnostic preservation',
  final_upload['if'].nil? && final_upload['continue-on-error'].nil? &&
  final_upload['with']['if-no-files-found'] == 'error' &&
  delivery['if'] == 'always()' &&
  delivery['env']['FINAL_EVIDENCE_OUTCOME'] == '${{ steps.final_evidence.outcome }}' &&
  diagnostics['if'] == 'failure()' && diagnostics['continue-on-error'].nil? &&
  diagnostics['with']['path'].include?('/publication.json') &&
  diagnostics['with']['path'].include?('/attempt-status.json'))
require 'tmpdir'
require 'fileutils'
Dir.mktmpdir('verilio-upload-contract-') do |dir|
  FileUtils.mkdir_p([File.join(dir, 'bin'), File.join(dir, 'verilio-evidence')])
  mock = File.join(dir, 'bin', 'node')
  File.write(mock, "#!/usr/bin/env bash\nprintf '%s\\n' \"$*\" >>\"$STATUS_LOG\"\n")
  File.chmod(0o755, mock)
  %w[failure cancelled skipped success].each do |outcome|
    log = File.join(dir, 'status.log')
    summary = File.join(dir, 'summary.md')
    File.write(log, '')
    File.write(summary, '')
    _, error, status = Open3.capture3({
      'PATH' => "#{File.join(dir, 'bin')}:#{ENV.fetch('PATH')}",
      'RUNNER_TEMP' => dir, 'STATUS_LOG' => log, 'GITHUB_STEP_SUMMARY' => summary,
      'FINAL_EVIDENCE_OUTCOME' => outcome
    }, 'bash', '-e', '-o', 'pipefail', '-c', delivery['run'])
    expected = outcome == 'success' ? 'uploaded' : 'incomplete'
    check.call("#{outcome} final upload records #{expected} without republishing",
      status.success? && error.empty? && File.read(log).include?(" delivery #{expected}\n") &&
      (outcome == 'success' ? File.read(summary).empty? : File.read(summary).include?('Never blindly republish')) &&
      !delivery['run'].match?(/publish-release-images|docker|build-release/))
  end
end
sign = workflow['jobs']['sign']
sign_steps = sign['steps']
check.call('official signing remains literally disabled on merge',
  sign['if'] == "${{ false && needs.publish.result == 'success' }}" && sign['needs'] == 'publish' &&
  !text.include?('vars.') && !triggers['workflow_dispatch']['inputs'].key?('sign'))
check.call('only fresh isolated signing job receives OIDC',
  job.fetch('permissions', workflow['permissions'])['id-token'].nil? &&
  sign['permissions'] == {'contents'=>'read', 'actions'=>'read', 'packages'=>'write', 'id-token'=>'write'} &&
  sign['runs-on'] == 'ubuntu-24.04')
check.call('signer executes workflow implementation SHA rather than artifact or application code',
  sign_steps.first['with']['ref'] == '${{ github.workflow_sha }}' && sign_steps.first['with']['persist-credentials'] == false)
transfer = sign_steps.find { |s| s['name'].start_with?('Retrieve exact') }
check.call('exact producer artifact IDs and complete publication validation precede signing auth',
  job['outputs']['qualified_artifact'] == '${{ steps.qualified_evidence.outputs.artifact-id }}' &&
  job['outputs']['publication_artifact'] == '${{ steps.final_evidence.outputs.artifact-id }}' &&
  transfer['env']['QUALIFIED_ARTIFACT'] == '${{ needs.publish.outputs.qualified_artifact }}' &&
  transfer['env']['PUBLICATION_ARTIFACT'] == '${{ needs.publish.outputs.publication_artifact }}' &&
  transfer['run'].include?('validate-publication') &&
  sign_steps.index(transfer) < sign_steps.index { |s| s['name'] == 'Authenticate signature attachment only' })
check.call('signing job never builds, retags, republishes or invokes SBOM generator',
  !sign_steps.map { |s| s.fetch('run', '') }.join("\n").match?(/build-release|publish-release-images|generate-release-sbom|docker (build|tag|push)/))
sign_upload = sign_steps.find { |s| s['id'] == 'signing_evidence' }
check.call('signature artifacts preserve allowlisted partial evidence and upload failure is fatal',
  sign_upload['if'] == 'always()' && sign_upload['continue-on-error'].nil? &&
  sign_upload['with']['retention-days'] == 30 && sign_upload['with']['if-no-files-found'] == 'error' &&
  !sign_upload['with']['path'].match?(/\*|credential|stderr|\.tmp/) &&
  sign_upload['with']['path'].include?('/attempt-status.json') && sign_upload['with']['path'].include?('/portable/verification.json'))
check.call('every new action is full-SHA pinned and shell blocks parse',
  sign_steps.all? { |s|
    (!s['uses'] || s['uses'].match?(/@[0-9a-f]{40}\z/)) &&
      (!s['run'] || Open3.capture3('bash', '-n', stdin_data: s['run']).last.success?)
  })
Dir.mktmpdir('verilio-sign-delivery-') do |dir|
  [['success', 'success', 'paired-verified'], ['success', 'failure', 'incomplete'], ['failure', 'success', 'incomplete']].each do |signing, artifact, expected|
    summary = File.join(dir, 'summary')
    File.write(summary, '')
    _, error, status = Open3.capture3({'SIGNING'=>signing, 'DELIVERY'=>artifact, 'GITHUB_STEP_SUMMARY'=>summary}, 'bash', '-e', '-o', 'pipefail', '-c', sign_steps.last['run'])
    check.call("signing #{signing} / artifact #{artifact} reports #{expected}",
      status.success? && error.empty? && File.read(summary).include?("Signing acceptance: #{expected};") &&
      !sign_steps.last['run'].match?(/sign-release-images|publish-release-images|docker/))
  end
end
puts "#{passed} publishing workflow contract tests passed including upload failure execution."
