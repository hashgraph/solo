// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {Failure, inputs, complete, junit, classifyDeploy, PACKAGES, PROBES, redact} from '../src/contract.mjs';
import {command} from '../src/process.mjs';
import {candidates, identity, install, packSolo} from '../src/packages.mjs';
import {PodState, jsonObjects, quantities} from '../src/pods.mjs';
import {mirror, messageMatches, transferMatches, transactionPath, recordLoadReceipt} from '../src/probe.mjs';
import {freePort} from '../src/run.mjs';

const sha = 'a'.repeat(40);
const arguments_ = ['--component', 'js-sdk', '--candidate-packages', '/candidate'];
const policy = {default: '0.93.0', supported: ['0.93.0']};
const failure = reason => error => error instanceof Failure && error.reason === reason;

function fixture(context) {
  const directory = mkdtempSync(path.join(tmpdir(), 'solo-tck-test-'));
  context.after(() => rmSync(directory, {recursive: true, force: true}));
  return directory;
}

test('release policy accepts only verified releases or a full SHA', () => {
  assert.equal(inputs(arguments_, policy)['solo-version'], '0.93.0');
  assert.equal(inputs([...arguments_, '--solo-version', sha], {default: null, supported: []}).unreleased, true);
  for (const value of ['main', 'latest', '24dc1ffc', '0.94.0']) {
    assert.throws(() => inputs([...arguments_, '--solo-version', value], policy), failure('invalid'));
  }
  assert.throws(() => inputs(arguments_, {default: null, supported: []}), failure('invalid'));
});

test('lane inputs cannot add flags, unsupported lanes or silently claim a local tarball is released', () => {
  for (const extra of [
    ['--component', 'mirror-node'],
    ['--unknown', 'x'],
    ['--solo-tarball', '/build.tgz'],
    ['--cluster-name', 'production'],
    ['--mirror-node-version', 'latest'],
  ]) {
    assert.throws(() => inputs([...arguments_, ...extra], policy), failure('invalid'));
  }
  assert.equal(
    inputs(
      [...arguments_, '--cluster-name', 'solo-tck-local-1', '--solo-version', sha, '--solo-tarball', '/build.tgz'],
      policy,
    ).cluster,
    'solo-tck-local-1',
  );
});

test('deploy errors stay red without claiming the SDK caused a Solo bug', () => {
  assert.equal(classifyDeploy('NodeAccountId not recognized: 0.0.2'), 'unknown');
  assert.equal(classifyDeploy('Unsupported component version'), 'invalid');
});

test('missing probes cannot pass, and JUnit preserves failures and missing probes', () => {
  const result = {probes: {P1: {status: 'pass'}, P2: {status: 'fail', message: 'bad <image> & "tag"'}}};
  assert.throws(() => complete(result), failure('kit'));
  assert.match(junit(result), /failures="1" skipped="6"/);
  assert.match(junit(result), /bad &lt;image&gt; &amp; &quot;tag&quot;/);
  for (const id of PROBES) result.probes[id] = {status: 'pass'};
  complete(result);
  assert.throws(
    () => complete(result, new Failure('unknown', 'OOM observed while stopping watch')),
    failure('unknown'),
  );
  result.incomplete = true;
  assert.throws(() => complete(result), failure('unknown'));
});

test('JUnit excludes terminal control characters', () => {
  assert.ok(!junit({probes: {P2: {status: 'fail', message: '\u001b[31mfailed\u0000'}}}).includes('\u001b'));
  assert.ok(!junit({probes: {P2: {status: 'fail', message: '\u0000'}}}).includes('\u0000'));
});

test('load reads back the last submissions even when receipts arrive out of order', () => {
  const load = {successful: 0};
  recordLoadReceipt(load, 2399, {message: 'last'});
  recordLoadReceipt(load, 2397, {message: 'earlier'});
  recordLoadReceipt(load, 2398, {path: 'last transfer'});
  recordLoadReceipt(load, 2396, {path: 'earlier transfer'});
  assert.deepEqual(load.lastMessage, {message: 'last'});
  assert.deepEqual(load.lastTransfer, {path: 'last transfer'});
  assert.equal(load.successful, 4);
});

test('command deadline stops real child processes; absolute stage deadlines cannot reset', async () => {
  await assert.rejects(command(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {timeout: 40}), /deadline/);
  await assert.rejects(
    command(process.execPath, ['-e', 'process.exit(0)'], {deadline: Date.now() - 1}),
    /deadline exhausted/,
  );
});

test('command cancellation propagates and a nonzero executable cannot become a pass', async () => {
  const controller = new AbortController();
  const work = command(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {signal: controller.signal});
  controller.abort(new Failure('unknown', 'cancelled by test'));
  await assert.rejects(work, /cancelled/);
  await assert.rejects(command(process.execPath, ['-e', 'process.exit(7)']), /exited 7/);
});

test('test keys are redacted, including keys emitted by Solo', () => {
  const key = `302e020100300506032b657004220420${'a'.repeat(64)}`;
  assert.equal(redact(`key=${key}, custom=secret`, ['secret']), 'key=<REDACTED_TEST_KEY>, custom=<REDACTED>');
  assert.equal(redact(`{"privateKey":"${'a'.repeat(64)}"}`), '{"privateKey":"<REDACTED_TEST_KEY>"}');
  assert.equal(redact(`--ed25519-private-key ${'b'.repeat(64)}`), '--ed25519-private-key <REDACTED_TEST_KEY>');
});

function pod(overrides = {}) {
  return {
    kind: 'Pod',
    metadata: {name: 'node-0', uid: 'original'},
    spec: {containers: [{name: 'main', image: 'test:v1'}]},
    status: {
      phase: 'Running',
      conditions: [{type: 'Ready', status: 'True'}],
      containerStatuses: [{name: 'main', restartCount: 0, state: {running: {}}}],
    },
    ...overrides,
  };
}

test('watch parser handles chunk boundaries, escaped strings and multiple JSON objects', () => {
  const objects = [];
  const parse = jsonObjects(value => objects.push(value));
  const source = `${JSON.stringify({type: 'ADDED', object: pod(), note: '{"quoted"}'})}\n${JSON.stringify({type: 'MODIFIED', object: pod()})}`;
  for (let offset = 0; offset < source.length; offset += 7) parse(source.slice(offset, offset + 7));
  assert.equal(objects.length, 2);
  assert.equal(objects[0].object.metadata.uid, 'original');
});

for (const [name, status, reason] of [
  ['OOM now', {state: {terminated: {reason: 'OOMKilled'}}, restartCount: 0}, 'unknown'],
  ['OOM earlier', {lastState: {terminated: {reason: 'OOMKilled'}}, restartCount: 1}, 'unknown'],
  ['image missing', {state: {waiting: {reason: 'ErrImageNeverPull'}}, restartCount: 0}, 'environment'],
  ['invalid image', {state: {waiting: {reason: 'InvalidImageName'}}, restartCount: 0}, 'environment'],
  ['crash loop', {state: {waiting: {reason: 'CrashLoopBackOff'}}, restartCount: 2}, 'unknown'],
]) {
  test(`pod negative control: ${name} fails during deploy`, () => {
    const value = pod();
    value.status.containerStatuses = [{name: 'main', ...status}];
    assert.throws(() => new PodState().observe(value), failure(reason));
  });
}

test('post-deploy restart, UID replacement, deletion and NotReady all fail stability', () => {
  for (const change of ['restart', 'replace', 'delete', 'notReady']) {
    const state = new PodState();
    state.observe(pod());
    state.deployed();
    const next = pod();
    if (change === 'restart') next.status.containerStatuses[0].restartCount = 1;
    if (change === 'replace') next.metadata.uid = 'replacement';
    if (change === 'delete') {
      assert.throws(() => state.observe({type: 'DELETED', object: next}), failure('unknown'));
    } else if (change === 'notReady') {
      next.status.conditions[0].status = 'False';
      state.observe(next);
      assert.throws(() => state.stable(), failure('unknown'));
    } else assert.throws(() => state.observe(next), failure('unknown'));
  }
});

test('a persistent noncandidate image pull failure fails after five minutes', () => {
  const state = new PodState();
  const value = pod();
  value.status.containerStatuses[0].state = {waiting: {reason: 'ImagePullBackOff'}};
  state.observe(value, 1000);
  assert.throws(() => state.observe(value, 301000), failure('environment'));
});

test('empty workload cannot pass stability and metrics are converted without inventing zero samples', () => {
  assert.throws(() => new PodState().stable(), failure('unknown'));
  assert.deepEqual(quantities('25m', '120Mi'), {cpuCores: 0.025, memoryBytes: 125829120});
  assert.deepEqual(quantities('2', '1Gi'), {cpuCores: 2, memoryBytes: 1073741824});
});

test('mirror readback waits for the exact transaction data; mismatched topic content fails', async context => {
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify(
        request.url === '/transfer'
          ? {
              transactions: [
                {
                  result: 'SUCCESS',
                  transfers: [
                    {account: '0.0.2', amount: 1000},
                    {account: '0.0.1012', amount: -2000},
                  ],
                },
              ],
            }
          : {sequence_number: 1, message: Buffer.from('wrong').toString('base64')},
      ),
    );
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  context.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  await mirror(base, '/transfer', body => transferMatches(body, {amount: 1000, account: '0.0.1012'}), 100);
  await assert.rejects(
    mirror(base, '/topic', body => messageMatches(body, {sequence: '1', message: 'expected'}), 50),
    failure('candidate'),
  );
  assert.equal(
    transactionPath({accountId: '0.0.1012', validStart: {seconds: 1234, nanos: 50}}),
    '/api/v1/transactions/0.0.1012-1234-000000050',
  );
  await assert.rejects(freePort(server.address().port), failure('environment'));
});

async function tarball(directory, name, metadata, files = {}) {
  const source = path.join(directory, name);
  mkdirSync(path.join(source, 'package'), {recursive: true});
  writeFileSync(path.join(source, 'package/package.json'), JSON.stringify(metadata));
  for (const [filename, text] of Object.entries(files)) writeFileSync(path.join(source, 'package', filename), text);
  const archive = path.join(directory, `${name}.tgz`);
  await command('tar', ['-czf', archive, '-C', source, 'package']);
  return archive;
}

test('real npm install proves tarball integrity and both Solo SDK resolutions; tampering fails', async context => {
  const root = fixture(context);
  const packs = path.join(root, 'packs');
  mkdirSync(packs);
  for (const [index, name] of PACKAGES.entries()) {
    await tarball(
      packs,
      String(index),
      {
        name,
        version: '1.0.0',
        ...(index === 0
          ? {
              exports: {import: './index.mjs', require: './index.cjs'},
              dependencies: {
                '@hiero-ledger/proto': '1.0.0',
                '@hiero-ledger/cryptography': '1.0.0',
              },
            }
          : {}),
      },
      {'index.mjs': 'export const candidate = true;', 'index.cjs': 'exports.candidate = true;'},
    );
  }
  const solo = await tarball(root, 'solo', {
    name: '@hiero-ledger/solo',
    version: '1.0.0',
    dependencies: {'@hiero-ledger/sdk': '1.0.0'},
  });
  const found = await candidates(packs);
  const directory = path.join(root, 'installed');
  mkdirSync(directory);
  await install(directory, `file:${solo}`, found, {timeout: 30_000});
  const proof = await identity(directory, found);
  assert.equal(proof.packages.length, 3);
  assert.match(proof.required, /index.cjs$/);
  assert.match(proof.imported, /index.mjs$/);
  const lockfile = path.join(directory, 'package-lock.json');
  const lock = JSON.parse(readFileSync(lockfile, 'utf8'));
  lock.packages['node_modules/@hiero-ledger/sdk'].integrity = 'sha512-wrong';
  writeFileSync(lockfile, JSON.stringify(lock));
  await assert.rejects(identity(directory, found), failure('candidate'));
  await tarball(packs, 'duplicate', {name: '@hiero-ledger/sdk', version: '1.0.0'});
  await assert.rejects(candidates(packs), failure('invalid'));
});

test('CLI rejects unverified releases and writes a final failing result and JUnit without touching a cluster', context => {
  const directory = fixture(context);
  const script = path.resolve(import.meta.dirname, '../src/run.mjs');
  const run = spawnSync(process.execPath, [script, ...arguments_, '--solo-version', '0.93.0'], {
    env: {...process.env, RUNNER_TEMP: directory},
    shell: false,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(run.status, 2, run.stderr);
  const file = /Result: (.+tck-result.json)/.exec(run.stdout)[1];
  const result = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(result.outcome, 'fail');
  assert.equal(result.reason, 'invalid');
  assert.equal(result.cleanup.cluster.detail, 'No owned cluster was created; nothing deleted');
  assert.match(readFileSync(path.join(path.dirname(file), 'junit.xml'), 'utf8'), /failures="1"/);
});

test('packing a Solo source tree tolerates lifecycle output before the npm result', async context => {
  const directory = fixture(context);
  const checkout = path.join(directory, 'checkout');
  const destination = path.join(directory, 'packed');
  mkdirSync(checkout);
  mkdirSync(destination);
  writeFileSync(
    path.join(checkout, 'package.json'),
    JSON.stringify({
      name: '@hiero-ledger/solo',
      version: '1.0.0',
      scripts: {prepare: 'node -e "console.log(\'Removing existing symlink\')"'},
    }),
  );
  const archive = await packSolo(checkout, destination);
  const metadata = JSON.parse(await command('tar', ['-xOf', archive, 'package/package.json']));
  assert.equal(metadata.name, '@hiero-ledger/solo');
});
