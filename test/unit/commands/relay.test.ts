// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';
import {container} from 'tsyringe-neo';
import {RelayCommand} from '../../../src/commands/relay.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {resetForTest} from '../../test-container.js';
import {type HelmChartValues} from '../../../src/integration/helm/model/values.js';
import {SoloErrors} from '../../../src/core/errors/solo-errors.js';
import {type ArgvStruct} from '../../../src/types/aliases.js';

interface RelayCommandInternal {
  prepareNetworkJsonString: (nodeAliases: string[], namespace: NamespaceName, deployment: string) => Promise<string>;
  prepareHelmChartValuesForRelay: (configuration: Record<string, unknown>) => Promise<HelmChartValues>;
  isLocalImageAvailableInDocker: (componentImage: string) => boolean;
}

const prepareRelayValueArguments: (
  relayCommandInternal: RelayCommandInternal,
  configuration: Record<string, unknown>,
) => Promise<string[]> = async (
  relayCommandInternal: RelayCommandInternal,
  configuration: Record<string, unknown>,
  // eslint-disable-next-line unicorn/no-await-expression-member
): Promise<string[]> => (await relayCommandInternal.prepareHelmChartValuesForRelay(configuration)).toArguments();

const createRelayConfig: (overrides?: Record<string, unknown>) => Record<string, unknown> = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  [flags.valuesFile.constName]: '',
  nodeAliases: ['node1'],
  [flags.chainId.constName]: '',
  [flags.relayReleaseTag.constName]: '',
  [flags.componentImage.constName]: '',
  [flags.replicaCount.constName]: 1,
  [flags.operatorId.constName]: '0.0.2',
  [flags.operatorKey.constName]: 'operator-key',
  [flags.namespace.constName]: NamespaceName.of('solo-e2e'),
  [flags.domainName.constName]: undefined,
  context: 'kind-solo-cluster',
  releaseName: 'relay-1',
  [flags.deployment.constName]: 'deployment',
  [flags.mirrorNamespace.constName]: 'solo-e2e',
  mirrorNodeReleaseName: 'mirror-1',
  ...overrides,
});

describe('RelayCommand unit tests', (): void => {
  let relayCommand: RelayCommand;

  beforeEach((): void => {
    resetForTest();
    relayCommand = container.resolve(RelayCommand);
    sinon.stub(relayCommand as unknown as RelayCommandInternal, 'isLocalImageAvailableInDocker').returns(false);
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('should apply relayReleaseTag to relay and ws image tags', async (): Promise<void> => {
    const relayCommandInternal: RelayCommandInternal = relayCommand as unknown as RelayCommandInternal;

    sinon.stub(relayCommandInternal, 'prepareNetworkJsonString').resolves('{"127.0.0.1:50211":"0.0.3"}');

    const valueArguments: string[] = await prepareRelayValueArguments(
      relayCommandInternal,
      createRelayConfig({
        [flags.relayReleaseTag.constName]: '0.77.0',
      }),
    );

    expect(valueArguments).to.include('relay.image.tag=0.77.0');
    expect(valueArguments).to.include('ws.image.tag=0.77.0');
  });

  it('should use mirror ingress for REST and direct mirror node service for web3 URL', async (): Promise<void> => {
    const relayCommandInternal: RelayCommandInternal = relayCommand as unknown as RelayCommandInternal;

    sinon.stub(relayCommandInternal, 'prepareNetworkJsonString').resolves('{"127.0.0.1:50211":"0.0.3"}');

    const valueArguments: string[] = await prepareRelayValueArguments(
      relayCommandInternal,
      createRelayConfig({
        [flags.mirrorNamespace.constName]: 'mirror-ns',
        mirrorNodeReleaseName: 'mirror-1',
      }),
    );

    expect(valueArguments).to.include(
      // eslint-disable-next-line unicorn/prefer-https
      'relay.config.MIRROR_NODE_URL=http://mirror-ingress-controller-mirror-ns.mirror-ns.svc.cluster.local',
    );
    expect(valueArguments).to.include(
      // eslint-disable-next-line unicorn/prefer-https
      'relay.config.MIRROR_NODE_URL_WEB3=http://mirror-1-web3.mirror-ns.svc.cluster.local',
    );
    expect(valueArguments).to.include(
      // eslint-disable-next-line unicorn/prefer-https
      'ws.config.MIRROR_NODE_URL=http://mirror-ingress-controller-mirror-ns.mirror-ns.svc.cluster.local',
    );
  });

  it('should accept full relay image reference and set relay/ws image registry repository and tag', async (): Promise<void> => {
    const relayCommandInternal: RelayCommandInternal = relayCommand as unknown as RelayCommandInternal;

    sinon.stub(relayCommandInternal, 'prepareNetworkJsonString').resolves('{"127.0.0.1:50211":"0.0.3"}');

    const valueArguments: string[] = await prepareRelayValueArguments(
      relayCommandInternal,
      createRelayConfig({
        [flags.componentImage.constName]: 'docker.io/library/v400.0',
      }),
    );

    expect(valueArguments).to.include('relay.image.registry=docker.io');
    expect(valueArguments).to.include('ws.image.registry=docker.io');
    expect(valueArguments).to.include('relay.image.repository=library/v400.0');
    expect(valueArguments).to.include('ws.image.repository=library/v400.0');
    expect(valueArguments).to.include('relay.image.tag=latest');
    expect(valueArguments).to.include('ws.image.tag=latest');
  });

  it('should accept docker hub shorthand and infer docker.io/library repository', async (): Promise<void> => {
    const relayCommandInternal: RelayCommandInternal = relayCommand as unknown as RelayCommandInternal;

    sinon.stub(relayCommandInternal, 'prepareNetworkJsonString').resolves('{"127.0.0.1:50211":"0.0.3"}');

    const valueArguments: string[] = await prepareRelayValueArguments(
      relayCommandInternal,
      createRelayConfig({
        [flags.componentImage.constName]: 'redis:7',
      }),
    );

    expect(valueArguments).to.include('relay.image.registry=docker.io');
    expect(valueArguments).to.include('ws.image.registry=docker.io');
    expect(valueArguments).to.include('relay.image.repository=library/redis');
    expect(valueArguments).to.include('ws.image.repository=library/redis');
    expect(valueArguments).to.include('relay.image.tag=7');
    expect(valueArguments).to.include('ws.image.tag=7');
  });

  it('should use a Never pull policy for an available Kind-attached local registry image', async (): Promise<void> => {
    const relayCommandInternal: RelayCommandInternal = relayCommand as unknown as RelayCommandInternal;
    sinon.restore();
    sinon.stub(relayCommandInternal, 'isLocalImageAvailableInDocker').returns(true);
    sinon.stub(relayCommandInternal, 'prepareNetworkJsonString').resolves('{"127.0.0.1:50211":"0.0.3"}');

    const valueArguments: string[] = await prepareRelayValueArguments(
      relayCommandInternal,
      createRelayConfig({
        [flags.componentImage.constName]: 'localhost:5001/hiero-json-rpc-relay:0.61.0',
      }),
    );

    expect(valueArguments).to.include('relay.image.registry=localhost:5001');
    expect(valueArguments).to.include('relay.image.repository=hiero-json-rpc-relay');
    expect(valueArguments).to.include('relay.image.pullPolicy=Never');
    expect(valueArguments).to.include('ws.image.pullPolicy=Never');
  });

  it('should set relay and ws service type to LoadBalancer when load balancer is enabled', async (): Promise<void> => {
    const relayCommandInternal: RelayCommandInternal = relayCommand as unknown as RelayCommandInternal;

    sinon.stub(relayCommandInternal, 'prepareNetworkJsonString').resolves('{"127.0.0.1:50211":"0.0.3"}');

    const valueArguments: string[] = await prepareRelayValueArguments(
      relayCommandInternal,
      createRelayConfig({
        [flags.loadBalancerEnabled.constName]: true,
      }),
    );

    expect(valueArguments).to.include('relay.service.type=LoadBalancer');
    expect(valueArguments).to.include('ws.service.type=LoadBalancer');
  });

  it('should not override service types when load balancer is disabled', async (): Promise<void> => {
    const relayCommandInternal: RelayCommandInternal = relayCommand as unknown as RelayCommandInternal;

    sinon.stub(relayCommandInternal, 'prepareNetworkJsonString').resolves('{"127.0.0.1:50211":"0.0.3"}');

    const valueArguments: string[] = await prepareRelayValueArguments(relayCommandInternal, createRelayConfig());

    expect(valueArguments).to.not.include('relay.service.type=LoadBalancer');
    expect(valueArguments).to.not.include('ws.service.type=LoadBalancer');
  });

  it('should reject plain tag value for componentImage', async (): Promise<void> => {
    const relayCommandInternal: RelayCommandInternal = relayCommand as unknown as RelayCommandInternal;

    sinon.stub(relayCommandInternal, 'prepareNetworkJsonString').resolves('{"127.0.0.1:50211":"0.0.3"}');

    try {
      await prepareRelayValueArguments(
        relayCommandInternal,
        createRelayConfig({
          [flags.componentImage.constName]: 'latest',
        }),
      );
      expect.fail('Expected prepareHelmChartValuesForRelay to throw');
    } catch (error) {
      expect(error.message).to.include('Invalid image reference format: latest');
    }
  });

  it('wraps an add() Initialize failure in RelayDeployFailedSoloError exactly once', async (): Promise<void> => {
    sinon.stub(relayCommand.localConfig, 'load').rejects(new Error('boom'));

    try {
      await relayCommand.add({_: []} as unknown as ArgvStruct);
      expect.fail('Expected add() to throw');
    } catch (error) {
      expect(error).to.be.instanceOf(SoloErrors.component.relayDeployFailed);
      expect(error.message).to.equal('Error deploying relay: boom');
      expect(error.cause.message).to.equal('boom');
    }
  });
});
