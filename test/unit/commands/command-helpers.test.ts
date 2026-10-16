// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon from 'sinon';
import {container} from 'tsyringe-neo';
import {CommandHelpers} from '../../../src/commands/command-helpers.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {ArgumentProcessor} from '../../../src/argument-processor.js';
import {ConfigManager} from '../../../src/core/config-manager.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type TaskList, type TaskNodeType} from '../../../src/core/task-list/task-list.js';
import {type ListrContext, type ListrRendererValue} from 'listr2';
import {BASE_TEST_DIR, getTestLogger} from '../../test-utility.js';

describe('CommandHelpers.subTaskSoloCommand', (): void => {
  let configManager: ConfigManager;

  beforeEach((): void => {
    container.clearInstances();
    container.register(InjectTokens.LogLevel, {useValue: 'debug'});
    container.register(InjectTokens.DevelopmentMode, {useValue: true});
    container.register(InjectTokens.HomeDirectory, {useValue: BASE_TEST_DIR});
    container.registerInstance(InjectTokens.SoloLogger, getTestLogger());
    configManager = new ConfigManager(getTestLogger());
    container.registerInstance(InjectTokens.ConfigManager, configManager);
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('does not inherit component image overrides from sibling command state', async (): Promise<void> => {
    configManager.setFlag(flags.componentImage, 'gcr.io/mirrornode/hedera-mirror:0.164.2-tck.local1');
    configManager.setFlag(flags.componentImageArchive, '/tmp/mirror-node-candidate.tar');

    const taskList: TaskList<ListrContext, ListrRendererValue, ListrRendererValue> = {
      parentTaskListMap: new Map<string, TaskNodeType[]>(),
    } as unknown as TaskList<ListrContext, ListrRendererValue, ListrRendererValue>;

    let scopedComponentImage: string | undefined;
    let scopedComponentImageArchive: string | undefined;

    sinon.stub(ArgumentProcessor, 'process').callsFake(async (): Promise<void> => {
      scopedComponentImage = configManager.getFlag<string>(flags.componentImage);
      scopedComponentImageArchive = configManager.getFlag<string>(flags.componentImageArchive);
    });

    await CommandHelpers.subTaskSoloCommand(
      'explorer node add',
      {} as never,
      (): string[] => ['${PATH}/node', '${SOLO_ROOT}/solo.ts', 'explorer', 'node', 'add'],
      taskList,
    );

    expect(scopedComponentImage).to.equal(undefined);
    expect(scopedComponentImageArchive).to.equal(undefined);
    expect(configManager.getFlag(flags.componentImage)).to.equal('gcr.io/mirrornode/hedera-mirror:0.164.2-tck.local1');
    expect(configManager.getFlag(flags.componentImageArchive)).to.equal('/tmp/mirror-node-candidate.tar');
  });
});
