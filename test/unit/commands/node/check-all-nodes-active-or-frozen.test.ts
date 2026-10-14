// SPDX-License-Identifier: Apache-2.0

import {describe, it, afterEach} from 'mocha';
import {expect} from 'chai';
import sinon from 'sinon';
import {container} from 'tsyringe-neo';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type SoloListrTaskWrapper} from '../../../../src/types/index.js';
import {type AnyListrContext} from '../../../../src/types/aliases.js';

function createNodeCommandTasks(consensusNodeContextsByAlias: Record<string, string>): NodeCommandTasks {
  const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;

  (nodeCommandTasks as unknown as {logger: unknown}).logger = {
    debug: (): void => {},
  };

  (nodeCommandTasks as unknown as {remoteConfig: unknown}).remoteConfig = {
    getConsensusNodes: (): Array<{name: string; context: string}> =>
      Object.entries(consensusNodeContextsByAlias).map(([name, context]): {name: string; context: string} => ({
        name,
        context,
      })),
  };

  return nodeCommandTasks;
}

function buildContext(nodeAliases: string[], resumeFromFreeze: boolean = false): AnyListrContext {
  return {
    config: {
      namespace: NamespaceName.of('namespace'),
      nodeAliases,
      resumeFromFreeze,
    },
  } as unknown as AnyListrContext;
}

describe('NodeCommandTasks.checkAllNodesAreActiveOrFrozen', (): void => {
  afterEach((): void => {
    sinon.restore();
  });

  it('fails fast with a clear error when nodes disagree on terminal status', async (): Promise<void> => {
    sinon.stub(container, 'resolve').returns({
      getNetworkNodePlatformStatusName: async (podReference: {name: {name: string}}): Promise<string> =>
        podReference.name.name.includes('node1') ? 'ACTIVE' : 'FREEZE_COMPLETE',
    } as never);

    const nodeCommandTasks: NodeCommandTasks = createNodeCommandTasks({node1: 'context-1', node2: 'context-2'});
    const context_: AnyListrContext = buildContext(['node1', 'node2']);
    const task: SoloListrTaskWrapper<AnyListrContext> = {title: ''} as unknown as SoloListrTaskWrapper<AnyListrContext>;

    await expect(
      (
        nodeCommandTasks.checkAllNodesAreActiveOrFrozen('nodeAliases').task as (
          context_: AnyListrContext,
          task: SoloListrTaskWrapper<AnyListrContext>,
        ) => Promise<void>
      )(context_, task),
    ).to.be.rejectedWith('Restored nodes disagree on terminal status: node1=ACTIVE, node2=FREEZE_COMPLETE');

    expect(context_.config.restoredFromFreezeState).to.be.undefined;
  });

  it('does not retry by default (resumeFromFreeze unset) even when every node is FREEZE_COMPLETE, so a deliberate frozen-state restore is preserved', async (): Promise<void> => {
    sinon.stub(container, 'resolve').returns({
      getNetworkNodePlatformStatusName: async (): Promise<string> => 'FREEZE_COMPLETE',
    } as never);

    const nodeCommandTasks: NodeCommandTasks = createNodeCommandTasks({node1: 'context-1', node2: 'context-2'});
    const startSingleNodeStub: sinon.SinonStub = sinon
      .stub(nodeCommandTasks as unknown as Record<string, unknown>, 'startSingleNode')
      .resolves();
    const context_: AnyListrContext = buildContext(['node1', 'node2']);
    const task: SoloListrTaskWrapper<AnyListrContext> = {title: ''} as unknown as SoloListrTaskWrapper<AnyListrContext>;

    await (
      nodeCommandTasks.checkAllNodesAreActiveOrFrozen('nodeAliases').task as (
        context_: AnyListrContext,
        task: SoloListrTaskWrapper<AnyListrContext>,
      ) => Promise<void>
    )(context_, task);

    expect(startSingleNodeStub.callCount).to.equal(0);
    expect(context_.config.restoredFromFreezeState).to.be.true;
  });

  it('with resumeFromFreeze=true, retries once, then records restoredFromFreezeState=true when every node is still FREEZE_COMPLETE after the retry', async (): Promise<void> => {
    sinon.stub(container, 'resolve').returns({
      getNetworkNodePlatformStatusName: async (): Promise<string> => 'FREEZE_COMPLETE',
    } as never);

    const nodeCommandTasks: NodeCommandTasks = createNodeCommandTasks({node1: 'context-1', node2: 'context-2'});
    const startSingleNodeStub: sinon.SinonStub = sinon
      .stub(nodeCommandTasks as unknown as Record<string, unknown>, 'startSingleNode')
      .resolves();
    const context_: AnyListrContext = buildContext(['node1', 'node2'], true);
    const task: SoloListrTaskWrapper<AnyListrContext> = {title: ''} as unknown as SoloListrTaskWrapper<AnyListrContext>;

    await (
      nodeCommandTasks.checkAllNodesAreActiveOrFrozen('nodeAliases').task as (
        context_: AnyListrContext,
        task: SoloListrTaskWrapper<AnyListrContext>,
      ) => Promise<void>
    )(context_, task);

    expect(startSingleNodeStub.callCount).to.equal(2);
    expect(context_.config.restoredFromFreezeState).to.be.true;
  });

  it('with resumeFromFreeze=true, recovers to ACTIVE after a single retry restart when the first check finds every node FREEZE_COMPLETE', async (): Promise<void> => {
    let callCount: number = 0;
    sinon.stub(container, 'resolve').returns({
      getNetworkNodePlatformStatusName: async (): Promise<string> => {
        callCount++;
        return callCount <= 2 ? 'FREEZE_COMPLETE' : 'ACTIVE';
      },
    } as never);

    const nodeCommandTasks: NodeCommandTasks = createNodeCommandTasks({node1: 'context-1', node2: 'context-2'});
    const startSingleNodeStub: sinon.SinonStub = sinon
      .stub(nodeCommandTasks as unknown as Record<string, unknown>, 'startSingleNode')
      .resolves();
    const context_: AnyListrContext = buildContext(['node1', 'node2'], true);
    const task: SoloListrTaskWrapper<AnyListrContext> = {title: ''} as unknown as SoloListrTaskWrapper<AnyListrContext>;

    await (
      nodeCommandTasks.checkAllNodesAreActiveOrFrozen('nodeAliases').task as (
        context_: AnyListrContext,
        task: SoloListrTaskWrapper<AnyListrContext>,
      ) => Promise<void>
    )(context_, task);

    expect(startSingleNodeStub.callCount).to.equal(2);
    expect(context_.config.restoredFromFreezeState).to.be.false;
  });

  it('does not retry when every node is already ACTIVE on the first check', async (): Promise<void> => {
    sinon.stub(container, 'resolve').returns({
      getNetworkNodePlatformStatusName: async (): Promise<string> => 'ACTIVE',
    } as never);

    const nodeCommandTasks: NodeCommandTasks = createNodeCommandTasks({node1: 'context-1', node2: 'context-2'});
    const startSingleNodeStub: sinon.SinonStub = sinon
      .stub(nodeCommandTasks as unknown as Record<string, unknown>, 'startSingleNode')
      .resolves();
    const context_: AnyListrContext = buildContext(['node1', 'node2']);
    const task: SoloListrTaskWrapper<AnyListrContext> = {title: ''} as unknown as SoloListrTaskWrapper<AnyListrContext>;

    await (
      nodeCommandTasks.checkAllNodesAreActiveOrFrozen('nodeAliases').task as (
        context_: AnyListrContext,
        task: SoloListrTaskWrapper<AnyListrContext>,
      ) => Promise<void>
    )(context_, task);

    expect(startSingleNodeStub.callCount).to.equal(0);
    expect(context_.config.restoredFromFreezeState).to.be.false;
  });
});
