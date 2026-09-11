// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {container} from 'tsyringe-neo';
import * as Base64 from 'js-base64';
import {RelayCommand} from '../../../src/commands/relay.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {resetForTest} from '../../test-container.js';
import {type HelmChartValues} from '../../../src/integration/helm/model/values.js';
import {SoloErrors} from '../../../src/core/errors/solo-errors.js';
import {type ArgvStruct} from '../../../src/types/aliases.js';
import {SecretType} from '../../../src/integration/kube/resources/secret/secret-type.js';
import {type Secret} from '../../../src/integration/kube/resources/secret/secret.js';
import * as constants from '../../../src/core/constants.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';

interface RelayCommandInternal {
  prepareNetworkJsonString: (nodeAliases: string[], namespace: NamespaceName, deployment: string) => Promise<string>;
  prepareHelmChartValuesForRelay: (configuration: Record<string, unknown>) => Promise<HelmChartValues>;
  isLocalImageAvailableInDocker: (componentImage: string) => boolean;
  createOperatorSecret: (configuration: Record<string, unknown>) => Promise<string>;
  supportsOperatorSecret: (relayReleaseTag: string) => boolean;
  k8Factory: K8Factory;
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
  operatorSecretName: 'relay-1-operator',
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

  describe('operator credentials secret', (): void => {
    let relayCommandInternal: RelayCommandInternal;
    let secretsListStub: SinonStub;
    let secretsCreateOrReplaceStub: SinonStub;

    beforeEach((): void => {
      relayCommandInternal = relayCommand as unknown as RelayCommandInternal;

      secretsListStub = sinon.stub().resolves([]);
      secretsCreateOrReplaceStub = sinon.stub().resolves(true);
      const secretsStub: object = {list: secretsListStub, createOrReplace: secretsCreateOrReplaceStub};

      sinon.stub(relayCommandInternal.k8Factory, 'getK8').returns({secrets: (): object => secretsStub} as never);
    });

    it('never exposes operator id or key as a plaintext helm --set value', async (): Promise<void> => {
      sinon.stub(relayCommandInternal, 'prepareNetworkJsonString').resolves('{"127.0.0.1:50211":"0.0.3"}');

      const valueArguments: string[] = await prepareRelayValueArguments(
        relayCommandInternal,
        createRelayConfig({operatorSecretName: 'relay-1-operator'}),
      );

      expect(valueArguments.join(' ')).to.not.include('OPERATOR_ID_MAIN');
      expect(valueArguments.join(' ')).to.not.include('OPERATOR_KEY_MAIN');
      expect(valueArguments.join(' ')).to.not.include('operator-key');
      expect(valueArguments).to.include('relay.existingSecret=relay-1-operator');
      expect(valueArguments).to.include('ws.existingSecret=relay-1-operator');
    });

    it('creates a k8s secret from the provided operator id and key', async (): Promise<void> => {
      const operatorSecretName: string = await relayCommandInternal.createOperatorSecret(
        createRelayConfig({operatorId: '0.0.2', operatorKey: 'super-secret-key'}),
      );

      expect(operatorSecretName).to.equal('relay-1-operator');
      expect(secretsListStub.called).to.be.false;
      expect(secretsCreateOrReplaceStub.calledOnce).to.be.true;

      const [namespace, name, type, data] = secretsCreateOrReplaceStub.firstCall.args as [
        NamespaceName,
        string,
        SecretType,
        Record<string, string>,
      ];
      expect(namespace).to.deep.equal(NamespaceName.of('solo-e2e'));
      expect(name).to.equal('relay-1-operator');
      expect(type).to.equal(SecretType.OPAQUE);
      expect(data.OPERATOR_ID_MAIN).to.equal(Base64.encode('0.0.2'));
      expect(data.OPERATOR_KEY_MAIN).to.equal(Base64.encode('super-secret-key'));
    });

    it('falls back to the operator key stored in a per-account k8s secret when none is provided', async (): Promise<void> => {
      const existingKey: string = 'key-from-secret';
      const foundSecret: Secret = {
        data: {privateKey: Base64.encode(existingKey)},
        name: 'account-secret',
        namespace: 'solo-e2e',
        type: SecretType.OPAQUE,
        labels: {},
      };
      secretsListStub.resolves([foundSecret]);

      await relayCommandInternal.createOperatorSecret(createRelayConfig({operatorKey: undefined}));

      const data: Record<string, string> = secretsCreateOrReplaceStub.firstCall.args[3];
      expect(data.OPERATOR_KEY_MAIN).to.equal(Base64.encode(existingKey));
    });

    it('falls back to the default operator key when no flag or k8s secret is available', async (): Promise<void> => {
      await relayCommandInternal.createOperatorSecret(createRelayConfig({operatorKey: undefined}));

      const data: Record<string, string> = secretsCreateOrReplaceStub.firstCall.args[3];
      expect(data.OPERATOR_KEY_MAIN).to.equal(Base64.encode(constants.OPERATOR_KEY));
    });

    it('throws RelayOperatorSecretCreationFailedSoloError when the secret cannot be created', async (): Promise<void> => {
      secretsCreateOrReplaceStub.resolves(false);

      try {
        await relayCommandInternal.createOperatorSecret(createRelayConfig());
        expect.fail('Expected createOperatorSecret to throw');
      } catch (error) {
        expect(error).to.be.instanceOf(SoloErrors.component.relayOperatorSecretCreationFailed);
      }
    });

    it('wraps a k8s secret lookup failure in RelayOperatorKeyRetrievalFailedSoloError', async (): Promise<void> => {
      secretsListStub.rejects(new Error('cluster unreachable'));

      try {
        await relayCommandInternal.createOperatorSecret(createRelayConfig({operatorKey: undefined}));
        expect.fail('Expected createOperatorSecret to throw');
      } catch (error) {
        expect(error).to.be.instanceOf(SoloErrors.component.relayOperatorKeyRetrievalFailed);
      }
    });

    it('only uses the operator secret for relay charts that support it', (): void => {
      // unpinned: Helm resolves the newest published chart
      expect(relayCommandInternal.supportsOperatorSecret('')).to.be.true;
      expect(relayCommandInternal.supportsOperatorSecret('0.78.0')).to.be.true;
      // pre-release qualifiers must not drop below the floor
      expect(relayCommandInternal.supportsOperatorSecret('0.78.0-rc1')).to.be.true;
      expect(relayCommandInternal.supportsOperatorSecret('v0.78.5')).to.be.true;
      expect(relayCommandInternal.supportsOperatorSecret('1.0.0')).to.be.true;

      expect(relayCommandInternal.supportsOperatorSecret('0.77.0')).to.be.false;
      expect(relayCommandInternal.supportsOperatorSecret('v0.77.1')).to.be.false;
      expect(relayCommandInternal.supportsOperatorSecret('0.60.0')).to.be.false;
    });

    it('passes the operator id and key as helm values when the chart predates existingSecret', async (): Promise<void> => {
      sinon.stub(relayCommandInternal, 'prepareNetworkJsonString').resolves('{"127.0.0.1:50211":"0.0.3"}');

      const valueArguments: string[] = await prepareRelayValueArguments(
        relayCommandInternal,
        createRelayConfig({
          operatorSecretName: undefined,
          [flags.relayReleaseTag.constName]: '0.77.0',
        }),
      );

      expect(valueArguments).to.include('relay.config.OPERATOR_ID_MAIN=0.0.2');
      expect(valueArguments).to.include('ws.config.OPERATOR_ID_MAIN=0.0.2');
      expect(valueArguments).to.include('relay.config.OPERATOR_KEY_MAIN=operator-key');
      expect(valueArguments).to.include('ws.config.OPERATOR_KEY_MAIN=operator-key');
      expect(valueArguments.join(' ')).to.not.include('existingSecret');
    });
  });
});
