// SPDX-License-Identifier: Apache-2.0

import {after, before, describe, it} from 'mocha';
import {expect} from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {type NodeUpgradeConfigClass} from '../../../../src/commands/node/config-interfaces/node-upgrade-config-class.js';
import {SoloErrors} from '../../../../src/core/errors/solo-errors.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import * as constants from '../../../../src/core/constants.js';

type ResolvePostUpgradeSystemFiles = (config: NodeUpgradeConfigClass) => Map<string, string>;

const resolve: ResolvePostUpgradeSystemFiles = (config: NodeUpgradeConfigClass): Map<string, string> => {
  const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;
  return (
    nodeCommandTasks as unknown as {resolvePostUpgradeSystemFiles: ResolvePostUpgradeSystemFiles}
  ).resolvePostUpgradeSystemFiles(config);
};

const buildConfig: (overrides: Partial<NodeUpgradeConfigClass>) => NodeUpgradeConfigClass = (
  overrides: Partial<NodeUpgradeConfigClass>,
): NodeUpgradeConfigClass =>
  ({
    simpleFeesSchedulesFile: '',
    throttlesFile: '',
    upgradeZipFile: '',
    upgradeVersion: 'v0.76.4',
    ...overrides,
  }) as unknown as NodeUpgradeConfigClass;

describe('NodeCommandTasks.resolvePostUpgradeSystemFiles', (): void => {
  let temporaryDirectory: string;
  let simpleFeesSchedulesFile: string;
  let throttlesFile: string;

  before((): void => {
    temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'post-upgrade-system-files-'));
    simpleFeesSchedulesFile = PathEx.join(temporaryDirectory, 'my-fees.json');
    throttlesFile = PathEx.join(temporaryDirectory, 'my-throttles.json');
    fs.writeFileSync(simpleFeesSchedulesFile, '{}');
    fs.writeFileSync(throttlesFile, '{}');
  });

  after((): void => {
    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
  });

  it('returns nothing when no system file flags are set', (): void => {
    expect(resolve(buildConfig({})).size).to.equal(0);
  });

  it('maps each provided file to the file name the node expects', (): void => {
    const files: Map<string, string> = resolve(buildConfig({simpleFeesSchedulesFile, throttlesFile}));

    expect(files.get(constants.SIMPLE_FEES_SCHEDULES_JSON)).to.equal(PathEx.resolve(simpleFeesSchedulesFile));
    expect(files.get(constants.THROTTLES_JSON)).to.equal(PathEx.resolve(throttlesFile));
  });

  it('accepts the simple fees schedules file from the first supported version', (): void => {
    expect(resolve(buildConfig({simpleFeesSchedulesFile, upgradeVersion: 'v0.68.0'})).size).to.equal(1);
  });

  it('rejects the simple fees schedules file for a consensus node older than v0.68.0', (): void => {
    expect((): Map<string, string> =>
      resolve(buildConfig({simpleFeesSchedulesFile, upgradeVersion: 'v0.67.0'})),
    ).to.throw(SoloErrors.validation.postUpgradeSystemFileVersionUnsupported);
  });

  it('rejects the throttles file for a consensus node older than v0.54.0', (): void => {
    expect((): Map<string, string> => resolve(buildConfig({throttlesFile, upgradeVersion: 'v0.53.0'}))).to.throw(
      SoloErrors.validation.postUpgradeSystemFileVersionUnsupported,
    );
  });

  it('skips the version check when no upgrade version is given', (): void => {
    expect(resolve(buildConfig({simpleFeesSchedulesFile, upgradeVersion: ''})).size).to.equal(1);
  });

  it('resolves files for the dev-freeze prepare-upgrade config, which has no zip file or upgrade version', (): void => {
    const prepareUpgradeConfig: NodeUpgradeConfigClass = {
      simpleFeesSchedulesFile,
      throttlesFile,
    } as unknown as NodeUpgradeConfigClass;

    expect(resolve(prepareUpgradeConfig).size).to.equal(2);
  });

  it('rejects a system file flag combined with --upgrade-zip-file', (): void => {
    expect((): Map<string, string> => resolve(buildConfig({throttlesFile, upgradeZipFile: 'upgrade.zip'}))).to.throw(
      SoloErrors.validation.upgradeSystemFileWithZipFile,
    );
  });

  it('rejects a system file that does not exist', (): void => {
    const missingFile: string = PathEx.join(temporaryDirectory, 'missing.json');

    expect((): Map<string, string> => resolve(buildConfig({throttlesFile: missingFile}))).to.throw(
      SoloErrors.validation.configFileNotFound,
    );
  });
});
