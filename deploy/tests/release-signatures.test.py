"""Offline contracts: no daemon, network, privileges or real signing."""
import base64
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('signatures', ROOT / 'deploy/signing/release_signatures.py')
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)
P = s.policy()
X = s.expected('v9.8.7-test', 'a' * 40, 'sha256:' + '1' * 64, 'sha256:' + '2' * 64, P)
CTX = ('workflow_dispatch', 'refs/heads/main', 'b' * 40, 'c' * 40)


def bundle(service='api'):
    statement = {'_type': 'https://in-toto.io/Statement/v1', 'predicateType': P['predicate_type'], 'predicate': {}, 'subject': [{'digest': {'sha256': X[service][7:]}, 'annotations': s.claims(service, X, P, *CTX)}]}
    return {'mediaType': P['bundle_media_type'], 'verificationMaterial': {'tlogEntries': [{}]}, 'dsseEnvelope': {'payloadType': 'application/vnd.in-toto+json', 'payload': base64.b64encode(json.dumps(statement).encode()).decode(), 'signatures': [{}]}}


class Contracts(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='verilio-sign-test-')
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)

    def verify(self, b, service='api'):
        file = self.dir / 'fixture.json'
        file.write_text(json.dumps(b))
        with patch.object(s.subprocess, 'run') as run:
            result = s.verify_bundle(file, service, X, P, '/pinned/cosign', {})
            return result, run.call_args.args[0]

    def test_policy_pins(self):
        self.assertFalse(P['official_signing_enabled'])
        self.assertIsNone(P['first_required_release'])
        self.assertEqual(P['historical_contexts'], [])

    def test_policy_modification_refused(self):
        with patch.object(s, 'load', side_effect=[{**P, 'issuer': 'evil'}, s.load(s.ROOT / 'toolchain.json')]):
            with self.assertRaises(ValueError): s.policy()

    def test_historical_policy_refused(self):
        pin = s.load(s.ROOT / 'toolchain.json')
        with patch.object(s, 'load', side_effect=[{**P, 'historical_contexts': ['old-workflow']}, pin]):
            with self.assertRaises(ValueError): s.policy()

    def test_unknown_policy_version_refused(self):
        pin = s.load(s.ROOT / 'toolchain.json')
        with patch.object(s, 'load', side_effect=[{**P, 'version': 'unknown'}, pin]):
            with self.assertRaises(ValueError): s.policy()

    def test_reviewed_historical_era(self):
        old = {'version': '1', 'workflow': '.github/workflows/previous-publisher.yml', 'contexts': P['contexts'], 'release_versions': [X['version']], 'revoked': False}
        current = {**P, 'version': '2', 'historical_contexts': [old]}
        chosen = s.applicable_policy(current, '1', X['version'])
        self.assertEqual(chosen['workflow'], old['workflow'])
        self.assertEqual(chosen['version'], '1')

    def test_revoked_historical_era(self):
        old = {'version': '1', 'workflow': '.github/workflows/previous-publisher.yml', 'contexts': P['contexts'], 'release_versions': [X['version']], 'revoked': True}
        with self.assertRaises(ValueError): s.applicable_policy({**P, 'version': '2', 'historical_contexts': [old]}, '1', X['version'])

    def test_historical_release_outside_era(self):
        old = {'version': '1', 'workflow': '.github/workflows/previous-publisher.yml', 'contexts': P['contexts'], 'release_versions': ['v1.0.0'], 'revoked': False}
        with self.assertRaises(ValueError): s.applicable_policy({**P, 'version': '2', 'historical_contexts': [old]}, '1', X['version'])

    def test_manual_app_workflow_sha_distinct(self):
        self.assertNotEqual(X['source'], CTX[2])
        self.assertTrue(s.context(*CTX, X, P).endswith('@refs/heads/main'))

    def test_tag_identity(self):
        self.assertTrue(s.context('push', 'refs/tags/' + X['version'], X['source'], 'c' * 40, X, P).endswith('@refs/tags/' + X['version']))

    def test_denied_invocation(self):
        with self.assertRaises(ValueError): s.context(*CTX, X, {**P, 'denied_invocations': [CTX[2]]})

    def test_exact_claims_and_crypto_command(self):
        _, command = self.verify(bundle())
        for flag, value in [('--certificate-oidc-issuer', P['issuer']), ('--certificate-github-workflow-trigger', CTX[0]), ('--certificate-github-workflow-ref', CTX[1]), ('--certificate-github-workflow-sha', CTX[2]), ('--digest', X['api'][7:]), ('--type', P['predicate_type'])]:
            self.assertEqual(command[command.index(flag) + 1], value)
        self.assertNotIn('--check-claims=false', command)
        self.assertNotIn('--insecure-ignore-tlog', command)

    def test_crypto_failure_not_accepted(self):
        f = self.dir / 'bad.json'; f.write_text(json.dumps(bundle()))
        with patch.object(s.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, ['cosign'])):
            with self.assertRaises(subprocess.CalledProcessError): s.verify_bundle(f, 'api', X, P, '/cosign', {})

    def test_wrong_executable_checksum(self):
        f = self.dir / 'cosign'; f.write_text('not cosign')
        with self.assertRaises(ValueError): s.tool(f)

    def test_wrong_executable_version(self):
        f = self.dir / 'cosign'; f.write_text('mock binary')
        pin = {'executable_sha256': {'linux/amd64': s.sha(f.read_bytes())}, 'version': 'v3.1.3'}
        with patch.object(s, 'load', return_value=pin), patch.object(s.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, b'{"gitVersion":"v0.0.0"}')):
            with self.assertRaises(ValueError): s.tool(f)

    def test_empty_verifier_environment(self):
        with patch.dict(os.environ, {'COSIGN_REPOSITORY': 'evil', 'GITHUB_TOKEN': 'sentinel'}):
            e = s.cosign_env(self.dir)
        self.assertNotIn('COSIGN_REPOSITORY', e)
        self.assertNotIn('GITHUB_TOKEN', e)
        self.assertEqual(e['DOCKER_CONFIG'], str(self.dir))

    def test_missing_oidc_capability(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ValueError): s.cosign_env(self.dir, signing=True)

    def test_default_off_before_subprocess(self):
        with patch.object(s.subprocess, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'disabled'): s.sign(self.dir, self.dir / 'out', '/cosign', P)
            run.assert_not_called()

    def test_not_ci(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ValueError): s.sign(self.dir, self.dir / 'out', '/cosign', {**P, 'official_signing_enabled': True})

    def test_receipt_validator_is_required(self):
        env = {'GITHUB_ACTIONS': 'true', 'GITHUB_REPOSITORY': 'andresz74/verilio', 'GITHUB_JOB': 'sign'}
        with patch.dict(os.environ, env, clear=True), patch.object(s.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, ['node'])) as run:
            with self.assertRaises(subprocess.CalledProcessError): s.sign(self.dir, self.dir / 'out', '/cosign', {**P, 'official_signing_enabled': True})
            self.assertIn('validate-publication', run.call_args.args[0])
            self.assertFalse((self.dir / 'out').exists())

    def material(self):
        c = json.dumps({'os': 'linux', 'architecture': 'amd64', 'config': {'Labels': {'org.opencontainers.image.source': 'https://github.com/andresz74/verilio', 'org.opencontainers.image.version': X['version'], 'org.opencontainers.image.revision': X['source']}}}).encode()
        m = json.dumps({'config': {'digest': 'sha256:' + s.sha(c)}}).encode()
        return m, c, {**X, 'api': 'sha256:' + s.sha(m)}

    def test_manifest_config_identity(self):
        m, c, x = self.material()
        s.check_material(m, c, 'api', x, 'sha256:' + s.sha(c))

    def test_wrong_qualified_config(self):
        m, c, x = self.material()
        with self.assertRaises(ValueError): s.check_material(m, c, 'api', x, X['gateway'])

    def test_wrong_manifest(self):
        m, c, x = self.material()
        with self.assertRaises(ValueError): s.check_material(m + b' ', c, 'api', x)

    def test_wrong_platform(self):
        m, c, x = self.material(); c = c.replace(b'amd64', b'arm64')
        m = json.dumps({'config': {'digest': 'sha256:' + s.sha(c)}}).encode(); x['api'] = 'sha256:' + s.sha(m)
        with self.assertRaises(ValueError): s.check_material(m, c, 'api', x)

    def test_wrong_source_labels(self):
        m, c, x = self.material(); c = c.replace(('a' * 40).encode(), ('b' * 40).encode())
        m = json.dumps({'config': {'digest': 'sha256:' + s.sha(c)}}).encode(); x['api'] = 'sha256:' + s.sha(m)
        with self.assertRaises(ValueError): s.check_material(m, c, 'api', x)

    def test_index_refused(self):
        m, c, x = self.material(); m = json.dumps({'manifests': [], 'config': {'digest': 'sha256:' + s.sha(c)}}).encode(); x['api'] = 'sha256:' + s.sha(m)
        with self.assertRaises(ValueError): s.check_material(m, c, 'api', x)

    def archive(self, names, symlink=False):
        raw = io.BytesIO()
        with zipfile.ZipFile(raw, 'w') as z:
            for name in names:
                i = zipfile.ZipInfo(name)
                if symlink: i.external_attr = 0o120777 << 16
                z.writestr(i, '{}')
        return raw.getvalue()

    def test_artifact_allowlist_complete(self):
        s.receive_archives([self.archive(sorted(s.EVIDENCE_FILES))], self.dir / 'received')
        self.assertEqual({f.name for f in (self.dir / 'received').iterdir()}, s.EVIDENCE_FILES)

    def test_duplicate_artifact_refused(self):
        with self.assertRaises(ValueError): s.receive_archives([self.archive(['qualification.json']), self.archive(['qualification.json'])], self.dir / 'received')

    def test_artifact_symlink_refused(self):
        with self.assertRaises(ValueError): s.receive_archives([self.archive(['qualification.json'], True)], self.dir / 'received')

    def test_artifact_missing_refused(self):
        with self.assertRaises(ValueError): s.receive_archives([self.archive(['qualification.json'])], self.dir / 'received')

    def test_artifact_traversal_refused(self):
        with self.assertRaises(ValueError): s.receive_archives([self.archive(['../qualification.json'])], self.dir / 'received')

    def test_artifact_output_no_overwrite(self):
        with self.assertRaises(FileExistsError): s.receive_archives([], self.dir)

    def test_receipt_exclusive_create(self):
        f = self.dir / 'receipt'; s.issue(f, {'a': 1})
        with self.assertRaises(FileExistsError): s.issue(f, {'a': 2})
        self.assertEqual(json.loads(f.read_text()), {'a': 1})

    def test_portable_symlink_refused(self):
        d = self.dir / 'link'; d.symlink_to(self.dir)
        with self.assertRaises(ValueError): s.validate_portable(d)

    def test_portable_unknown_file_refused(self):
        (self.dir / 'unknown').write_text('x')
        with self.assertRaises(ValueError): s.validate_portable(self.dir)

    def test_no_http(self):
        with self.assertRaises(ValueError): s.get('http://example.com')

    def test_sign_no_build_or_retag(self):
        import inspect
        body = inspect.getsource(s.sign)
        for forbidden in ('publish-release-images.sh', 'build-release.sh', 'docker build', 'docker tag', 'docker push'):
            self.assertNotIn(forbidden, body)
        self.assertIn('REPOSITORIES[s] + "@" + x[s]', body)

    def test_bash_syntax(self):
        for name in ('sign-release-images.sh', 'verify-release-signatures.sh'):
            subprocess.run(['bash', '-n', str(ROOT / 'deploy' / name)], check=True)


def add_case(name, edit):
    def test(self):
        b = bundle(); statement = json.loads(base64.b64decode(b['dsseEnvelope']['payload']))
        edit(b, statement)
        b['dsseEnvelope']['payload'] = base64.b64encode(json.dumps(statement).encode()).decode()
        with self.assertRaises((ValueError, KeyError, TypeError)):
            self.verify(b)
    setattr(Contracts, 'test_bundle_reject_' + name, test)


for name, edit in {
    'missing_transparency': lambda b, t: b['verificationMaterial'].update(tlogEntries=[]),
    'legacy_format': lambda b, t: b.update(mediaType='legacy'),
    'wrong_digest': lambda b, t: t['subject'][0].update(digest={'sha256': 'f' * 64}),
    'two_subjects': lambda b, t: t['subject'].append(copy.deepcopy(t['subject'][0])),
    'two_signatures': lambda b, t: b['dsseEnvelope']['signatures'].append({}),
    'wrong_predicate': lambda b, t: t.update(predicateType='custom-provenance'),
    'nonempty_predicate': lambda b, t: t.update(predicate={'qualification': 'passed'}),
    'wrong_repository': lambda b, t: t['subject'][0]['annotations'].update({'verilio.repository': 'ghcr.io/evil/copy'}),
    'wrong_source': lambda b, t: t['subject'][0]['annotations'].update({'verilio.source': 'f' * 40}),
    'wrong_version': lambda b, t: t['subject'][0]['annotations'].update({'verilio.version': 'v1.0.0'}),
    'wrong_platform': lambda b, t: t['subject'][0]['annotations'].update({'verilio.platform': 'linux/arm64'}),
    'mixed_pair': lambda b, t: t['subject'][0]['annotations'].update({'verilio.gateway': X['api']}),
    'unknown_claim': lambda b, t: t['subject'][0]['annotations'].update({'extra': 'claim'}),
    'wrong_policy': lambda b, t: t['subject'][0]['annotations'].update({'verilio.policy': '0'}),
    'wrong_ref': lambda b, t: t['subject'][0]['annotations'].update({'verilio.ref': 'refs/heads/evil'}),
    'wrong_event': lambda b, t: t['subject'][0]['annotations'].update({'verilio.event': 'pull_request'}),
}.items(): add_case(name, edit)


def input_case(name, values):
    def test(self):
        with self.assertRaises(ValueError): s.expected(*values, P)
    setattr(Contracts, 'test_inputs_' + name, test)


for name, values in {
    'legacy': ('v0.1.1-alpha.5', X['source'], X['api'], X['gateway']),
    'latest': ('latest', X['source'], X['api'], X['gateway']),
    'short_source': (X['version'], 'a' * 12, X['api'], X['gateway']),
    'tag_subject': (X['version'], X['source'], 'api:v1', X['gateway']),
    'missing_gateway': (X['version'], X['source'], X['api'], ''),
    'uppercase_digest': (X['version'], X['source'], 'sha256:' + 'A' * 64, X['gateway']),
}.items(): input_case(name, values)


def signing_case(name, failure):
    def test(self):
        env = {'GITHUB_ACTIONS': 'true', 'GITHUB_REPOSITORY': P['repository'], 'GITHUB_JOB': 'sign',
               'GITHUB_EVENT_NAME': CTX[0], 'GITHUB_REF': CTX[1], 'GITHUB_SHA': CTX[2], 'GITHUB_WORKFLOW_SHA': CTX[3],
               'GITHUB_WORKFLOW_REF': 'andresz74/verilio/.github/workflows/publish-images.yml@refs/heads/main',
               'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '2', 'DOCKER_CONFIG': str(self.dir),
               'ACTIONS_ID_TOKEN_REQUEST_URL': 'https://example.invalid', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN': 'test-only'}
        pub = {'version': X['version'], 'source_commit': X['source'], 'workflow': {'ref': env['GITHUB_WORKFLOW_REF'], 'commit': CTX[3], 'run_id': '123', 'run_attempt': '2'},
               'images': {k: {'manifest_digest': X[k], 'config_digest': 'sha256:' + '3' * 64} for k in s.SERVICES}}
        if failure == 'foreign-run': pub['workflow']['run_id'] = '124'
        (self.dir / 'publication.json').write_text(json.dumps(pub))
        output = self.dir / 'output'
        commands = []
        def command(args, **kwargs):
            commands.append(args)
            if args[0] == 'node': return subprocess.CompletedProcess(args, 0, json.dumps(pub).encode())
            component = 'api' if '/verilio-api@' in args[-1] else 'gateway'
            if failure == 'gateway-failed' and component == 'gateway': raise subprocess.CalledProcessError(1, args)
            if failure == 'interrupted': raise KeyboardInterrupt()
            Path(args[args.index('--bundle') + 1]).write_text(json.dumps(bundle(component)))
            return subprocess.CompletedProcess(args, 0)
        class Registry:
            def __init__(self, service): self.service = service
            def material(self, *args): return b'manifest', b'config'
            def bundles(self, *args): return [b'existing'] if failure == 'existing' else []
        def collect(directory, *args):
            if failure == 'anonymous-failed': raise ValueError('anonymous failed')
            directory.mkdir()
            for k in s.SERVICES: (directory / f'{k}.sigstore.json').write_bytes((output / f'{k}.sigstore.json').read_bytes())
            (directory / 'verification.json').write_text('{}')
        with patch.dict(os.environ, env, clear=True), patch.object(s.subprocess, 'run', side_effect=command), patch.object(s, 'get', return_value=json.dumps({'object': {'type': 'commit', 'sha': X['source']}}).encode()), patch.object(s, 'Registry', Registry), patch.object(s, 'check_material'), patch.object(s, 'collect', side_effect=collect):
            if failure:
                with self.assertRaises((ValueError, subprocess.CalledProcessError, KeyboardInterrupt)):
                    s.sign(self.dir, output, '/cosign', {**P, 'official_signing_enabled': True})
            else: s.sign(self.dir, output, '/cosign', {**P, 'official_signing_enabled': True})
        if failure == 'foreign-run':
            self.assertFalse(output.exists())
            self.assertEqual(len(commands), 1)
            return
        status = json.loads((output / 'attempt-status.json').read_text())
        self.assertEqual(status['state'], 'incomplete-review-required' if failure else 'paired-verified-artifact-delivery-pending')
        self.assertEqual((output / 'signing.json').exists(), not failure)
        if failure == 'gateway-failed':
            self.assertEqual(status['images'], {'api': 'attached-unverified', 'gateway': 'attempted-unknown'})
            self.assertTrue((output / 'api.sigstore.json').exists())
        if failure == 'interrupted': self.assertEqual(status['images']['api'], 'attempted-unknown')
        for command in commands[1:]:
            self.assertIn('--bundle', command)
            self.assertRegex(command[-1], r'ghcr.io/andresz74/verilio-(api|gateway)@sha256:[0-9a-f]{64}$')
    setattr(Contracts, 'test_signing_' + name, test)


for name, failure in [('success', None), ('gateway_failure', 'gateway-failed'), ('existing_signature', 'existing'), ('anonymous_failure', 'anonymous-failed'), ('interrupted', 'interrupted'), ('foreign_receipt', 'foreign-run')]:
    signing_case(name, failure)


def artifact_case(name, mutate):
    def test(self):
        env = {'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '2', 'GITHUB_SHA': 'b' * 40, 'GH_TOKEN': 'mock-only'}
        info = {'workflow_run': {'id': 123, 'head_sha': 'b' * 40}, 'name': 'sbom-v9.8.7-test-linux-amd64-123-2-qualified', 'expired': False, 'size_in_bytes': 1}
        mutate(info)
        with patch.dict(os.environ, env, clear=True), patch.object(s, 'get', return_value=json.dumps(info).encode()), patch.object(s.urllib.request, 'build_opener') as download:
            with self.assertRaises(ValueError): s.receive(self.dir / 'out', ['1', '2'], X['version'])
            download.assert_not_called()
    setattr(Contracts, 'test_artifact_metadata_' + name, test)


for name, mutate in {
    'foreign_run': lambda i: i['workflow_run'].update(id=456),
    'wrong_invocation': lambda i: i['workflow_run'].update(head_sha='f' * 40),
    'wrong_attempt': lambda i: i.update(name='sbom-v9.8.7-test-linux-amd64-123-1-qualified'),
    'expired': lambda i: i.update(expired=True),
    'oversized': lambda i: i.update(size_in_bytes=230000000),
}.items(): artifact_case(name, mutate)


def portable_case(name, failure):
    def test(self):
        m, c, x = self.material()
        for service in s.SERVICES:
            for suffix, data in [('manifest', m), ('config', c), ('sigstore', json.dumps(bundle(service)).encode())]:
                (self.dir / f'{service}.{suffix}.json').write_bytes(data)
        files = {f.name: s.sha(f.read_bytes()) for f in self.dir.iterdir()}
        record = {'schema': 'verilio.signature-verification/v1', 'verification': 'paired-passed', 'release': x,
                  'policy_sha256': s.sha((s.ROOT / 'policy.json').read_bytes()), 'trusted_root_sha256': s.sha((s.ROOT / 'trusted-root.json').read_bytes()), 'toolchain_sha256': s.sha((s.ROOT / 'toolchain.json').read_bytes()), 'files': files}
        if failure == 'checksum': record['files']['api.config.json'] = '0' * 64
        if failure == 'root': record['trusted_root_sha256'] = '0' * 64
        if failure == 'missing': (self.dir / 'gateway.sigstore.json').unlink()
        if failure == 'symlink':
            (self.dir / 'api.config.json').unlink(); (self.dir / 'api.config.json').symlink_to(self.dir / 'gateway.config.json')
        (self.dir / 'verification.json').write_text(json.dumps(record))
        if failure:
            with self.assertRaises(ValueError): s.validate_portable(self.dir)
        else:
            with patch.object(s, 'get', side_effect=AssertionError('offline must not use network')):
                self.assertEqual(s.validate_portable(self.dir)['release'], x)
    setattr(Contracts, 'test_portable_' + name, test)


for name in ('valid', 'checksum', 'root', 'missing', 'symlink'):
    portable_case(name, None if name == 'valid' else name)


if __name__ == '__main__': unittest.main(verbosity=2)
