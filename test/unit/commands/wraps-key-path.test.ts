// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {describe, it, beforeEach, afterEach} from 'mocha';
import {expect} from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {Flags as flags} from '../../../src/commands/flags.js';
import * as constants from '../../../src/core/constants.js';
import {TssSchema} from '../../../src/data/schema/model/solo/tss-schema.js';
import {WrapsSchema} from '../../../src/data/schema/model/solo/wraps-schema.js';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type ConfigManager} from '../../../src/core/config-manager.js';
import {type ConfigProvider} from '../../../src/data/configuration/api/config-provider.js';
import {type NodeCommandTasks} from '../../../src/commands/node/tasks.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {ValueContainer} from '../../../src/core/dependency-injection/value-container.js';
import {type InstanceOverrides} from '../../../src/core/dependency-injection/container-init.js';
import {SoloError} from '../../../src/core/errors/solo-error.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {type SoloListrTask} from '../../../src/types/index.js';
import {type NodeCommonConfigClass} from '../../../src/commands/node/config-interfaces/node-common-config-class.js';

describe('NodeCommandTasks.addWrapsLib', (): void => {
  let configManager: ConfigManager;
  let nodeCommandTasks: NodeCommandTasks;
  let sourceDirectory: string;
  let extractedDirectory: string;
  let downloaderStub: {fetchPackage: sinon.SinonStub};
  let zippyStub: {untar: sinon.SinonStub};

  const allowedFiles: string[] = ['decider_pp.bin', 'decider_vp.bin', 'nova_pp.bin', 'nova_vp.bin'];

  beforeEach(async (): Promise<void> => {
    sourceDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'wraps-test-'));
    extractedDirectory = PathEx.join(constants.SOLO_CACHE_DIR, 'wraps-v1.0.0');

    // Ensure parent cache directory exists
    if (!fs.existsSync(constants.SOLO_CACHE_DIR)) {
      fs.mkdirSync(constants.SOLO_CACHE_DIR, {recursive: true});
    }

    // Clean up extractedDirectory if it exists from a previous test
    if (fs.existsSync(extractedDirectory)) {
      fs.rmSync(extractedDirectory, {recursive: true, force: true});
    }

    downloaderStub = {fetchPackage: sinon.stub().resolves()};
    zippyStub = {untar: sinon.stub()};

    const remoteConfigStub: {configuration: {state: {wrapsEnabled: boolean}}; isLoaded: sinon.SinonStub} = {
      configuration: {state: {wrapsEnabled: true}},
      isLoaded: sinon.stub().returns(true),
    };

    const containerOverrides: InstanceOverrides = new Map([
      [InjectTokens.PackageDownloader, new ValueContainer(InjectTokens.PackageDownloader, downloaderStub)],
      [InjectTokens.Zippy, new ValueContainer(InjectTokens.Zippy, zippyStub)],
      [
        InjectTokens.RemoteConfigRuntimeState,
        new ValueContainer(InjectTokens.RemoteConfigRuntimeState, remoteConfigStub),
      ],
    ]);

    resetForTest(undefined, undefined, true, containerOverrides);

    configManager = container.resolve<ConfigManager>(InjectTokens.ConfigManager);
    nodeCommandTasks = container.resolve<NodeCommandTasks>(InjectTokens.NodeCommandTasks);

    // Load the config sources so TSS/WRAPS values are available via ConfigProvider
    const configProvider: ConfigProvider = container.resolve<ConfigProvider>(InjectTokens.ConfigProvider);
    await configProvider.config().refresh();
  });

  afterEach((): void => {
    sinon.restore();
    if (fs.existsSync(sourceDirectory)) {
      fs.rmSync(sourceDirectory, {recursive: true, force: true});
    }
    if (fs.existsSync(extractedDirectory)) {
      fs.rmSync(extractedDirectory, {recursive: true, force: true});
    }
  });

  it('should copy allowed .bin files from wrapsKeyPath to cache directory', async (): Promise<void> => {
    for (const file of allowedFiles) {
      fs.writeFileSync(path.join(sourceDirectory, file), `content-${file}`);
    }

    const argv: Argv = Argv.initializeEmpty();
    argv.setArg(flags.wrapsKeyPath, sourceDirectory);
    configManager.update(argv.build());

    const listrTask: SoloListrTask<{config: NodeCommonConfigClass}> = nodeCommandTasks.addWrapsLib();
    await listrTask.task({config: {consensusNodes: []}} as unknown as {config: NodeCommonConfigClass}, {} as never);

    const copiedFiles: string[] = fs.readdirSync(extractedDirectory);
    expect(copiedFiles).to.have.members(allowedFiles);

    for (const file of allowedFiles) {
      const content: string = fs.readFileSync(path.join(extractedDirectory, file), 'utf8');
      expect(content).to.equal(`content-${file}`);
    }
  });

  it('should ignore non-allowed files in wrapsKeyPath', async (): Promise<void> => {
    const extraFiles: string[] = ['README.md', 'extra.bin', 'config.json'];
    for (const file of [...allowedFiles, ...extraFiles]) {
      fs.writeFileSync(path.join(sourceDirectory, file), `content-${file}`);
    }

    const argv: Argv = Argv.initializeEmpty();
    argv.setArg(flags.wrapsKeyPath, sourceDirectory);
    configManager.update(argv.build());

    const listrTask: SoloListrTask<{config: NodeCommonConfigClass}> = nodeCommandTasks.addWrapsLib();
    await listrTask.task({config: {consensusNodes: []}} as unknown as {config: NodeCommonConfigClass}, {} as never);

    const copiedFiles: string[] = fs.readdirSync(extractedDirectory);
    expect(copiedFiles).to.have.members(allowedFiles);
    for (const extra of extraFiles) {
      expect(copiedFiles).to.not.include(extra);
    }
  });

  it('should throw SoloError for non-existent wrapsKeyPath', async (): Promise<void> => {
    const argv: Argv = Argv.initializeEmpty();
    argv.setArg(flags.wrapsKeyPath, '/this/path/does/not/exist');
    configManager.update(argv.build());

    const listrTask: SoloListrTask<{config: NodeCommonConfigClass}> = nodeCommandTasks.addWrapsLib();

    try {
      await listrTask.task({config: {consensusNodes: []}} as unknown as {config: NodeCommonConfigClass}, {} as never);
      expect.fail('Expected SoloError to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(SoloError);
      expect(error.message).to.include('WRAPs key path does not exist');
    }
  });

  it('should create destination directory if missing', async (): Promise<void> => {
    fs.writeFileSync(path.join(sourceDirectory, 'decider_pp.bin'), 'data');

    expect(fs.existsSync(extractedDirectory)).to.be.false;

    const argv: Argv = Argv.initializeEmpty();
    argv.setArg(flags.wrapsKeyPath, sourceDirectory);
    configManager.update(argv.build());

    const listrTask: SoloListrTask<{config: NodeCommonConfigClass}> = nodeCommandTasks.addWrapsLib();
    await listrTask.task({config: {consensusNodes: []}} as unknown as {config: NodeCommonConfigClass}, {} as never);

    expect(fs.existsSync(extractedDirectory)).to.be.true;
    expect(fs.readdirSync(extractedDirectory)).to.include('decider_pp.bin');
  });

  it('should fall back to download when wrapsKeyPath is not set', async (): Promise<void> => {
    const argv: Argv = Argv.initializeEmpty();
    configManager.update(argv.build());

    const listrTask: SoloListrTask<{config: NodeCommonConfigClass}> = nodeCommandTasks.addWrapsLib();
    await listrTask.task({config: {consensusNodes: []}} as unknown as {config: NodeCommonConfigClass}, {} as never);

    expect(downloaderStub.fetchPackage.calledOnce).to.be.true;
    expect(zippyStub.untar.calledOnce).to.be.true;
  });
});

describe('TssSchema WRAPS defaults', (): void => {
  it('allowedKeyFiles default should contain the expected file names', (): void => {
    const wraps: WrapsSchema = new WrapsSchema(
      'data/keys/wraps-v1.0.0',
      'wraps-v1.0.0',
      'decider_pp.bin,decider_vp.bin,nova_pp.bin,nova_vp.bin',
      'https://builds.hedera.com/tss/hiero/wraps/v1.0/wraps-v1.0.0.tar.gz',
    );
    const tss: TssSchema = new TssSchema(undefined, undefined, undefined, undefined, undefined, wraps);
    const files: string[] = (tss.wraps?.allowedKeyFiles ?? '').split(',');
    expect(files).to.have.members(['decider_pp.bin', 'decider_vp.bin', 'nova_pp.bin', 'nova_vp.bin']);
  });
});
