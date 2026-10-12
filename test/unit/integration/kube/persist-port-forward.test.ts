// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, type ChildProcess} from 'node:child_process';
import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {PathEx} from '../../../../src/business/utils/path-ex.js';

const currentDirectory: string = path.dirname(fileURLToPath(import.meta.url));

describe('persist-port-forward worker environment propagation', (): void => {
  let temporaryDirectory: string;
  let recordedEnvironmentPath: string;
  let fakeKubectlPath: string;
  let worker: ChildProcess | undefined;

  beforeEach((): void => {
    temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-persist-port-forward-'));
    recordedEnvironmentPath = PathEx.join(temporaryDirectory, 'recorded-env.json');
    fakeKubectlPath = PathEx.join(temporaryDirectory, 'fake-kubectl');

    // Records its own environment exactly once, on the `port-forward` invocation, then exits so
    // the worker's retry loop does not spin. `get ... -o name` invocations (the pod-existence poll)
    // exit 0 unconditionally so the worker treats the target pod as present.
    fs.writeFileSync(
      fakeKubectlPath,
      [
        '#!/usr/bin/env node',
        "if (process.argv.includes('port-forward')) {",
        `  require('node:fs').writeFileSync(${JSON.stringify(recordedEnvironmentPath)}, JSON.stringify(process.env));`,
        '}',
        'process.exit(0);',
        '',
      ].join('\n'),
    );
    fs.chmodSync(fakeKubectlPath, 0o755);
  });

  afterEach((): void => {
    if (worker && !worker.killed) {
      worker.kill('SIGKILL');
    }
    worker = undefined;
    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
  });

  it('forwards an operator-configured kubectl variable across the process boundary to the real kubectl spawn', async (): Promise<void> => {
    if (os.platform() === 'win32') {
      // The fake kubectl above relies on a POSIX shebang; the propagation logic under test is
      // platform independent and is exercised here on POSIX only.
      return;
    }

    const repositoryRoot: string = PathEx.join(currentDirectory, '../../../../');
    const scriptPath: string = PathEx.join(
      repositoryRoot,
      'src/integration/kube/k8-client/resources/pod/persist-port-forward.ts',
    );
    const tsxPath: string = PathEx.join(repositoryRoot, 'node_modules/.bin/tsx');

    worker = spawn(
      tsxPath,
      [
        scriptPath,
        'test-namespace',
        'pods/test-pod',
        'test-context',
        '9999:9999',
        fakeKubectlPath,
        '',
        JSON.stringify(['MY_OPERATOR_KUBECTL_VARIABLE']),
      ],
      {
        env: {
          ...process.env,
          MY_OPERATOR_KUBECTL_VARIABLE: 'from-the-operator',
          MY_UNLISTED_VARIABLE: 'should-not-appear',
        },
        stdio: 'ignore',
      },
    );

    const deadline: number = Date.now() + 10_000;
    while (!fs.existsSync(recordedEnvironmentPath) && Date.now() < deadline) {
      await new Promise<void>((resolve): void => {
        setTimeout(resolve, 100);
      });
    }

    expect(fs.existsSync(recordedEnvironmentPath), 'fake kubectl should have recorded its environment').to.equal(true);
    const recordedEnvironment: Record<string, string> = JSON.parse(
      fs.readFileSync(recordedEnvironmentPath, 'utf8'),
    ) as Record<string, string>;

    expect(
      recordedEnvironment.MY_OPERATOR_KUBECTL_VARIABLE,
      'a variable declared in subprocess.additionalEnvironmentVariables.kubectl must survive the ' +
        "worker's own re-filtering step, not just reach the worker process",
    ).to.equal('from-the-operator');
    expect(recordedEnvironment).to.not.have.property('MY_UNLISTED_VARIABLE');
  }).timeout(15_000);
});
