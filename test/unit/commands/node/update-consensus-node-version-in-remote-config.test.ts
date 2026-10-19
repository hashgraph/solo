// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {ComponentTypes} from '../../../../src/core/config/remote/enumerations/component-types.js';
import {type SemanticVersion} from '../../../../src/business/utils/semantic-version.js';
import {type NodeUpgradeContext} from '../../../../src/commands/node/config-interfaces/node-upgrade-context.js';

describe('NodeCommandTasks.updateConsensusNodeVersionInRemoteConfig', (): void => {
  it('persists the upgraded consensus node version to remote config', async (): Promise<void> => {
    const updateComponentVersionCalls: {type: ComponentTypes; version: SemanticVersion<string>}[] = [];
    let persistCallCount: number = 0;

    const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;

    (nodeCommandTasks as unknown as {remoteConfig: unknown}).remoteConfig = {
      updateComponentVersion: (type: ComponentTypes, version: SemanticVersion<string>): void => {
        updateComponentVersionCalls.push({type, version});
      },
      persist: async (): Promise<void> => {
        persistCallCount++;
      },
    };

    const context: NodeUpgradeContext = {
      config: {releaseTag: '0.75.1'},
    } as unknown as NodeUpgradeContext;

    await nodeCommandTasks.updateConsensusNodeVersionInRemoteConfig().task(context, undefined as never);

    expect(updateComponentVersionCalls).to.have.lengthOf(1);
    expect(updateComponentVersionCalls[0].type).to.equal(ComponentTypes.ConsensusNode);
    expect(updateComponentVersionCalls[0].version.toString()).to.equal('0.75.1');
    expect(persistCallCount).to.equal(1);
  });

  it('skips without persisting when no release tag was resolved (e.g. --local-build-path upgrades)', async (): Promise<void> => {
    let updateComponentVersionCallCount: number = 0;
    let persistCallCount: number = 0;
    let skipMessage: string | undefined;

    const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;

    (nodeCommandTasks as unknown as {remoteConfig: unknown}).remoteConfig = {
      updateComponentVersion: (): void => {
        updateComponentVersionCallCount++;
      },
      persist: async (): Promise<void> => {
        persistCallCount++;
      },
    };

    const context: NodeUpgradeContext = {
      config: {releaseTag: ''},
    } as unknown as NodeUpgradeContext;

    const task: {title: string; skip: (message: string) => void} = {
      title: 'Update consensus node version in remote config',
      skip: (message: string): void => {
        skipMessage = message;
      },
    };

    await nodeCommandTasks.updateConsensusNodeVersionInRemoteConfig().task(context, task as never);

    expect(updateComponentVersionCallCount).to.equal(0);
    expect(persistCallCount).to.equal(0);
    expect(skipMessage).to.include('SKIPPING');
  });
});
