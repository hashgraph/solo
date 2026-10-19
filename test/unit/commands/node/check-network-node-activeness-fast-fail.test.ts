// SPDX-License-Identifier: Apache-2.0

import {describe, it, afterEach} from 'mocha';
import {expect} from 'chai';
import sinon from 'sinon';
import {container} from 'tsyringe-neo';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import * as constants from '../../../../src/core/constants.js';
import {NodeStatusCodes} from '../../../../src/core/enumerations.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {type SoloListrTaskWrapper} from '../../../../src/types/index.js';
import {type AnyListrContext} from '../../../../src/types/aliases.js';

function createNodeCommandTasks(detectFatalContainerErrorStub: sinon.SinonStub): NodeCommandTasks {
  const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;

  (nodeCommandTasks as unknown as {logger: unknown}).logger = {
    debug: (): void => {},
  };

  (nodeCommandTasks as unknown as {remoteConfig: unknown}).remoteConfig = {
    getConsensusNodes: (): [] => [],
  };

  (nodeCommandTasks as unknown as {k8Factory: unknown}).k8Factory = {
    getK8: (): {pods: () => {read: () => Promise<Pod>; detectFatalContainerError: sinon.SinonStub}} => ({
      pods: (): {read: () => Promise<Pod>; detectFatalContainerError: sinon.SinonStub} => ({
        read: async (): Promise<Pod> => ({}) as unknown as Pod,
        detectFatalContainerError: detectFatalContainerErrorStub,
      }),
    }),
  };

  return nodeCommandTasks;
}

describe('NodeCommandTasks.checkNetworkNodeActiveness fast-fail on crashed container', (): void => {
  afterEach((): void => {
    sinon.restore();
  });

  it('fails fast once a fatal container error is detected repeatedly, without exhausting maxAttempts', async (): Promise<void> => {
    const getNetworkNodePodStatusStub: sinon.SinonStub = sinon
      .stub()
      .rejects(new Error('command terminated with exit code 137'));
    sinon.stub(container, 'resolve').returns({
      getNetworkNodePodStatus: getNetworkNodePodStatusStub,
    } as never);

    const detectFatalContainerErrorStub: sinon.SinonStub = sinon
      .stub()
      .returns('container "root" was terminated due to: Error (exit code 135)');
    const nodeCommandTasks: NodeCommandTasks = createNodeCommandTasks(detectFatalContainerErrorStub);

    const maxAttempts: number = 50;
    const task: SoloListrTaskWrapper<AnyListrContext> = {title: ''} as unknown as SoloListrTaskWrapper<AnyListrContext>;

    try {
      await nodeCommandTasks.checkNetworkNodeActiveness(
        NamespaceName.of('solo'),
        'node1',
        task,
        'Check network pod',
        NodeStatusCodes.ACTIVE,
        maxAttempts,
        0,
        1000,
        'kind-solo',
      );
      expect.fail('Expected checkNetworkNodeActiveness to throw');
    } catch (error: Error | unknown) {
      expect((error as Error).message).to.include('node1');
      expect((error as Error).message).to.include('crashed');
    }

    expect(getNetworkNodePodStatusStub.callCount).to.equal(constants.NETWORK_NODE_ACTIVE_FATAL_ERROR_THRESHOLD);
    expect(detectFatalContainerErrorStub.callCount).to.equal(constants.NETWORK_NODE_ACTIVE_FATAL_ERROR_THRESHOLD);
  });

  it('keeps retrying up to maxAttempts when no fatal container error is detected', async (): Promise<void> => {
    const getNetworkNodePodStatusStub: sinon.SinonStub = sinon.stub().rejects(new Error('transient exec error'));
    sinon.stub(container, 'resolve').returns({
      getNetworkNodePodStatus: getNetworkNodePodStatusStub,
    } as never);

    const detectFatalContainerErrorStub: sinon.SinonStub = sinon.stub();
    const nodeCommandTasks: NodeCommandTasks = createNodeCommandTasks(detectFatalContainerErrorStub);

    const maxAttempts: number = 5;
    const task: SoloListrTaskWrapper<AnyListrContext> = {title: ''} as unknown as SoloListrTaskWrapper<AnyListrContext>;

    try {
      await nodeCommandTasks.checkNetworkNodeActiveness(
        NamespaceName.of('solo'),
        'node1',
        task,
        'Check network pod',
        NodeStatusCodes.ACTIVE,
        maxAttempts,
        0,
        1000,
        'kind-solo',
      );
      expect.fail('Expected checkNetworkNodeActiveness to throw');
    } catch (error: Error | unknown) {
      expect((error as Error).message).to.include('node1');
    }

    expect(getNetworkNodePodStatusStub.callCount).to.equal(maxAttempts);
  });
});
