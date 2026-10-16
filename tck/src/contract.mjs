// SPDX-License-Identifier: Apache-2.0
import {parseArgs} from 'node:util';

export const PROBES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
export const EXIT = {candidate: 1, invalid: 2, environment: 3, kit: 4, unknown: 5};
export const PACKAGES = ['@hiero-ledger/sdk', '@hiero-ledger/proto', '@hiero-ledger/cryptography'];
export const LIMITS = {
  total: 1_200_000,
  cleanup: 180_000,
  setup: 180_000,
  deploy: 480_000,
  probes: 180_000,
  load: 180_000,
};

export class Failure extends Error {
  constructor(reason, message, options) {
    super(message, options);
    this.reason = reason;
  }
}

export function inputs(arguments_, policy) {
  let values;
  try {
    ({values} = parseArgs({
      args: arguments_,
      options: Object.fromEntries(
        [
          'component',
          'candidate-packages',
          'solo-version',
          'solo-tarball',
          'cluster-name',
          'consensus-node-version',
          'mirror-node-version',
        ].map(name => [name, {type: 'string'}]),
      ),
    }));
  } catch (error) {
    throw new Failure('invalid', error.message);
  }
  if (values.component !== 'js-sdk' || !values['candidate-packages']) {
    throw new Failure('invalid', 'This kit implements component js-sdk and requires candidate-packages.');
  }
  const version = values['solo-version'] || policy.default;
  const commit = typeof version === 'string' && /^[0-9a-f]{40}$/.test(version);
  if (!commit && !policy.supported.includes(version)) {
    throw new Failure(
      'invalid',
      `Unsupported Solo ${version ?? '(no default yet)'}. Supported: ${policy.supported.join(', ') || 'none; use an explicit Solo commit SHA during development'}.`,
    );
  }
  if (values['solo-tarball'] && !commit) {
    throw new Failure(
      'invalid',
      'The local-only solo-tarball option requires its explicit 40-character solo-version source SHA.',
    );
  }
  const cluster = values['cluster-name'] || 'solo-cluster';
  if (cluster !== 'solo-cluster' && !/^solo-tck-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cluster)) {
    throw new Failure(
      'invalid',
      'Local cluster-name must start with solo-tck- and contain lowercase letters, digits and hyphens.',
    );
  }
  for (const name of ['consensus-node-version', 'mirror-node-version']) {
    if (values[name] && !/^v?\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?$/.test(values[name])) {
      throw new Failure('invalid', `Invalid ${name}: ${values[name]}`);
    }
  }
  return {...values, 'solo-version': version, cluster, unreleased: commit};
}

export function classifyDeploy(message) {
  if (/incompatible|not compatible|unsupported.*version/i.test(message)) return 'invalid';
  // SDK rejection during Solo startup does not prove whether the SDK or Solo is wrong.
  return 'unknown';
}

export function redact(text, secrets = []) {
  let result = String(text);
  for (const secret of secrets.filter(Boolean)) result = result.split(secret).join('<REDACTED>');
  return result
    .replace(/302e020100300506032b657004220420[\da-f]{64}/gi, '<REDACTED_TEST_KEY>')
    .replace(
      /((?:privateKey|ed25519PrivateKey|ecdsaPrivateKey|operatorKey)["']?\s*[:=]\s*["']?)[\da-f]{32,}/gi,
      '$1<REDACTED_TEST_KEY>',
    )
    .replace(/((?:--ed25519-private-key|--operator-key)[=\s]+)[\da-f]{32,}/gi, '$1<REDACTED_TEST_KEY>');
}

export function complete(result, watchFailure) {
  if (result.incomplete) throw new Failure('unknown', 'An interrupted run cannot pass');
  if (watchFailure) throw watchFailure;
  if (!PROBES.every(id => result.probes[id]?.status === 'pass')) {
    throw new Failure('kit', 'Cannot pass: at least one required probe did not pass.');
  }
}

function xml(text) {
  return String(text)
    .replace(/[\u0000-\u0008\u000b-\u001f]/g, '')
    .replace(
      /[&<>"']/g,
      character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'})[character],
    );
}

export function junit(result) {
  const cases = PROBES.map(id => {
    const probe = result.probes[id];
    const content =
      probe?.status === 'pass'
        ? ''
        : probe?.status === 'fail'
          ? `<failure message="${xml(probe.message)}"/>`
          : '<skipped message="Not reached; overall run failed"/>';
    return `<testcase classname="solo-tck.js-sdk" name="${id}" time="${(probe?.milliseconds || 0) / 1000}">${content}</testcase>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="Solo TCK js-sdk" tests="8" failures="${PROBES.filter(id => result.probes[id]?.status === 'fail').length}" skipped="${PROBES.filter(id => !result.probes[id]).length}">${cases.join('')}</testsuite>\n`;
}
