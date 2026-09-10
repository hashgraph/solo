// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';

import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {PodReference} from '../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../src/integration/kube/resources/pod/pod-name.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';

describe('NetworkNodes', (): void => {
  let networkNodes: NetworkNodes;
  const podReference: PodReference = PodReference.of(NamespaceName.of('namespace'), PodName.of('network-node1-0'));

  beforeEach((): void => {
    resetForTest();
    networkNodes = container.resolve<NetworkNodes>(InjectTokens.NetworkNodes);
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('should map a platform status metric to its enum name', async (): Promise<void> => {
    sinon
      .stub(networkNodes, 'getNetworkNodePodStatus')
      .resolves('# HELP platform_PlatformStatus\nplatform_PlatformStatus 2');
    const status: string = await networkNodes.getNetworkNodePlatformStatusName(podReference);
    expect(status).to.equal('ACTIVE');
  });

  it('should return UNKNOWN for an empty or garbage response', async (): Promise<void> => {
    sinon.stub(networkNodes, 'getNetworkNodePodStatus').resolves('garbage without a status line');
    const status: string = await networkNodes.getNetworkNodePlatformStatusName(podReference);
    expect(status).to.equal('UNKNOWN');
  });

  it('should return UNKNOWN when the status fetch rejects', async (): Promise<void> => {
    sinon.stub(networkNodes, 'getNetworkNodePodStatus').rejects(new Error('exec failed'));
    const status: string = await networkNodes.getNetworkNodePlatformStatusName(podReference);
    expect(status).to.equal('UNKNOWN');
  });
});
