// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {spawnSync, type SpawnSyncReturns} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {HelmPostRenderer} from '../../../../src/integration/helm/helm-post-renderer.js';
import {OperatingSystem} from '../../../../src/business/utils/operating-system.js';
import {type HelmChartValues} from '../../../../src/integration/helm/model/values.js';

const itOnPosix: Mocha.TestFunction | Mocha.PendingTestFunction = OperatingSystem.isWin32() ? it.skip : it;

describe('HelmPostRenderer', (): void => {
  let directory: string;

  beforeEach((): void => {
    directory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-post-renderer-'));
  });

  afterEach((): void => {
    fs.rmSync(directory, {recursive: true, force: true});
  });

  it('rejects literals that could inject commands into the generated script', (): void => {
    expect((): HelmChartValues => HelmPostRenderer.replacer(directory, 3, "a'; rm -rf /; '", 'b')).to.throw();
    expect((): HelmChartValues => HelmPostRenderer.replacer(directory, 3, 'a', 'b c')).to.throw();
    expect((): HelmChartValues => HelmPostRenderer.replacer(directory, 3, 'a.b', 'c')).to.throw();
  });

  itOnPosix('passes Helm 3 the path of a script and the literals as arguments', (): void => {
    const chartValues: HelmChartValues = HelmPostRenderer.replacer(
      directory,
      3,
      'mirror-passwords',
      'mirror-passwords-2',
    );

    const valueArguments: string[] = chartValues.toArguments();
    expect(valueArguments[0]).to.equal('--post-renderer');
    expect(valueArguments[1]).to.equal(PathEx.join(directory, 'replace.sh'));
    expect(valueArguments.slice(2)).to.deep.equal([
      '--post-renderer-args',
      'mirror-passwords',
      '--post-renderer-args',
      'mirror-passwords-2',
    ]);
    expect(chartValues.toEnvironment()).to.deep.equal({});
  });

  itOnPosix('passes Helm 4 the name of a plugin found through HELM_PLUGINS', (): void => {
    const chartValues: HelmChartValues = HelmPostRenderer.replacer(
      directory,
      4,
      'mirror-passwords',
      'mirror-passwords-2',
    );

    expect(chartValues.toArguments().slice(0, 2)).to.deep.equal(['--post-renderer', 'solo-replace']);
    const pluginsDirectory: string = PathEx.join(directory, 'plugins');
    expect(chartValues.toEnvironment()).to.deep.equal({HELM_PLUGINS: pluginsDirectory});
    const manifest: string = fs.readFileSync(PathEx.join(pluginsDirectory, 'solo-replace', 'plugin.yaml'), 'utf8');
    expect(manifest).to.include('name: "solo-replace"');
    expect(manifest).to.include('type: postrenderer/v1');
    expect(manifest).to.include('${HELM_PLUGIN_DIR}/replace.sh');
    expect(fs.existsSync(PathEx.join(pluginsDirectory, 'solo-replace', 'replace.sh'))).to.be.true;
  });

  itOnPosix('writes a script that replaces its first argument with its second in whatever it is piped', (): void => {
    HelmPostRenderer.replacer(directory, 3, 'mirror-passwords', 'mirror-passwords-2');
    const rendered: string =
      'kind: Secret\nmetadata:\n  name: mirror-passwords\n---\nenvFrom:\n  - secretRef:\n      name: mirror-passwords\n';

    const result: SpawnSyncReturns<string> = spawnSync(
      PathEx.join(directory, 'replace.sh'),
      ['mirror-passwords', 'mirror-passwords-2'],
      {input: rendered, encoding: 'utf8'},
    );

    expect(result.status).to.equal(0);
    expect(result.stdout).to.equal(rendered.replaceAll('mirror-passwords', 'mirror-passwords-2'));
  });
});
