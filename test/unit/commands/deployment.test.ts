// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import sinon, {type SinonStub} from 'sinon';
import {before, beforeEach, afterEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type K8} from '../../../src/integration/kube/k8.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type DeploymentCommand} from '../../../src/commands/deployment.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {ValueContainer} from '../../../src/core/dependency-injection/value-container.js';
import {type InstanceOverrides} from '../../../src/core/dependency-injection/container-init.js';
import {K8Client} from '../../../src/integration/kube/k8-client/k8-client.js';
import {type Deployment} from '../../../src/business/runtime-state/config/local/deployment.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {type ConfigMap} from '../../../src/integration/kube/resources/config-map/config-map.js';
import {PodReference} from '../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../src/integration/kube/resources/pod/pod-name.js';
import * as constants from '../../../src/core/constants.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';

describe('DeploymentCommand unit tests', (): void => {
  type K8StubbedMethods = Pick<
    K8,
    'namespaces' | 'configMaps' | 'contexts' | 'clusters' | 'leases' | 'pods' | 'containers'
  >;
  type K8FactoryStubbedMethods = K8Factory & {getK8: SinonStub; default: SinonStub};

  const namespace: NamespaceName = NamespaceName.of('solo-e2e');
  const deploymentName: string = 'deployment';

  const k8FactoryStub: K8Factory = sinon.stub() as unknown as K8Factory;
  let containerOverrides: InstanceOverrides;
  let realK8Factory: K8Factory;
  let namespacesStub: SinonStub;
  let configMapsStub: SinonStub;
  let k8Stub: K8StubbedMethods;

  before((): void => {
    realK8Factory = container.resolve(InjectTokens.K8Factory);
  });

  beforeEach(async (): Promise<void> => {
    namespacesStub = sinon.stub();
    configMapsStub = sinon.stub();
    k8Stub = {} as K8StubbedMethods;
    const factoryStubbed: K8FactoryStubbedMethods = k8FactoryStub as K8FactoryStubbedMethods;

    factoryStubbed.getK8 = sinon.stub().returns(k8Stub);
    factoryStubbed.default = sinon.stub().returns(k8Stub);
    k8Stub.namespaces = sinon.stub().returns({
      has: namespacesStub,
      list: sinon.stub().resolves([]),
    });
    k8Stub.configMaps = sinon.stub().returns({
      exists: configMapsStub,
      listForAllNamespaces: sinon.stub().resolves([]),
    });
    k8Stub.contexts = sinon.stub().returns({
      readCurrent: sinon
        .stub()
        .returns(new K8Client(undefined, realK8Factory.default().getKubectlExecutablePath()).contexts().readCurrent()),
    });
    k8Stub.clusters = sinon.stub().returns({
      readCurrent: sinon.stub().returns(realK8Factory.default().clusters().readCurrent()),
    });
    k8Stub.leases = sinon.stub().returns({
      read: sinon.stub().rejects(new Error('not found')),
      create: sinon.stub().resolves(),
      delete: sinon.stub().resolves(),
      update: sinon.stub().resolves(),
    });

    containerOverrides = new Map([[InjectTokens.K8Factory, new ValueContainer(InjectTokens.K8Factory, k8FactoryStub)]]);

    resetForTest(undefined, undefined, true, containerOverrides);
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('create() - stale local config detection', (): void => {
    it('should detect stale local config and clean up when namespace does not exist in cluster', async (): Promise<void> => {
      // The test data has a "deployment" entry with cluster-1 → context-1
      // Simulate namespace NOT existing in the cluster (stale local config scenario)
      namespacesStub.resolves(false);

      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);
      const localConfig: LocalConfigRuntimeState = container.resolve(InjectTokens.LocalConfigRuntimeState);

      const argv: Argv = Argv.getDefaultArgv(namespace);
      argv.setArg(flags.deployment, deploymentName);
      argv.setArg(flags.namespace, namespace.name);

      // Should succeed - stale config is cleaned up automatically
      await expect(deploymentCommand.create(argv.build())).to.eventually.be.true;

      // Verify the deployment was re-created (still present in local config)
      await localConfig.load();
      const deployment: Deployment | undefined = localConfig.configuration.deployments.find(
        (d: Deployment): boolean => d.name === deploymentName,
      );
      expect(deployment).to.not.be.undefined;
      expect(deployment?.namespace).to.equal(namespace.name);
    });

    it('should detect stale local config and clean up when cluster connection fails', async (): Promise<void> => {
      // Simulate cluster connection failure (e.g., Kind cluster was deleted)
      k8Stub.namespaces = sinon.stub().returns({
        has: sinon.stub().rejects(new Error('connection refused - cluster no longer exists')),
        list: sinon.stub().rejects(new Error('connection refused')),
      });

      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);

      const argv: Argv = Argv.getDefaultArgv(namespace);
      argv.setArg(flags.deployment, deploymentName);
      argv.setArg(flags.namespace, namespace.name);

      // Should succeed - stale config is cleaned up when cluster is unreachable
      await expect(deploymentCommand.create(argv.build())).to.eventually.be.true;
    });

    it('should skip creation when deployment exists in local config and remote ConfigMap', async (): Promise<void> => {
      namespacesStub.resolves(true);
      configMapsStub.resolves(true);

      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);

      const argv: Argv = Argv.getDefaultArgv(namespace);
      argv.setArg(flags.deployment, deploymentName);
      argv.setArg(flags.namespace, namespace.name);

      await expect(deploymentCommand.create(argv.build())).to.eventually.be.true;

      const logger: SoloLogger = container.resolve(InjectTokens.SoloLogger);
      const infoSpy: SinonStub = sinon.stub(logger, 'info');

      await expect(deploymentCommand.create(argv.build())).to.eventually.be.true;

      expect(infoSpy.calledWith(`Deployment '${deploymentName}' already exists, skipping creation`)).to.be.true;
    });

    it('should proceed normally when deployment does not exist in local config', async (): Promise<void> => {
      const newDeploymentName: string = 'brand-new-deployment';
      const newNamespace: NamespaceName = NamespaceName.of('brand-new-namespace');

      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);

      const argv: Argv = Argv.getDefaultArgv(newNamespace);
      argv.setArg(flags.deployment, newDeploymentName);
      argv.setArg(flags.namespace, newNamespace.name);

      // Should succeed - new deployment, no conflict
      await expect(deploymentCommand.create(argv.build())).to.eventually.be.true;
    });
  });

  describe('importConfig()', (): void => {
    const importedDeploymentName: string = 'alpha-prod';
    const importedNamespaceName: string = 'solo-alpha-prod';
    const importedClusterReference: string = 'gke-alpha-prod-us-central1';
    const importKubeContext: string = 'context-1';

    let remoteConfigMap: ConfigMap;

    beforeEach((): void => {
      remoteConfigMap = {
        name: constants.SOLO_REMOTE_CONFIGMAP_NAME,
        namespace: NamespaceName.of(importedNamespaceName),
        labels: constants.SOLO_REMOTE_CONFIGMAP_LABELS,
        data: {
          [constants.SOLO_REMOTE_CONFIGMAP_DATA_KEY]: fs.readFileSync('test/data/v0-35-1-remote-config.yaml', 'utf8'),
        },
      };

      k8Stub.configMaps = sinon.stub().returns({
        exists: configMapsStub,
        list: sinon.stub().resolves([remoteConfigMap]),
        listForAllNamespaces: sinon.stub().resolves([remoteConfigMap]),
        read: sinon.stub().resolves(remoteConfigMap),
      });
    });

    function buildImportArgv(): Argv {
      const argv: Argv = Argv.getDefaultArgv(namespace);
      argv.setArg(flags.deployment, '');
      argv.setArg(flags.namespace, '');
      argv.setArg(flags.context, importKubeContext);
      return argv;
    }

    it('should reconstruct the local config from the remote config of an existing deployment', async (): Promise<void> => {
      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);
      const localConfig: LocalConfigRuntimeState = container.resolve(InjectTokens.LocalConfigRuntimeState);

      await expect(deploymentCommand.importConfig(buildImportArgv().build())).to.eventually.be.true;

      await localConfig.load();
      const imported: Deployment | undefined = localConfig.configuration.deployments.find(
        (deployment: Deployment): boolean => deployment.name === importedDeploymentName,
      );
      expect(imported).to.not.be.undefined;
      expect(imported?.namespace).to.equal(importedNamespaceName);
      expect(imported?.clusters.map((cluster): string => cluster.toString())).to.deep.equal([importedClusterReference]);
      expect(localConfig.configuration.clusterRefs.get(importedClusterReference)?.toString()).to.equal(
        importKubeContext,
      );
    });

    it('should be idempotent when the deployment was already imported', async (): Promise<void> => {
      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);
      const localConfig: LocalConfigRuntimeState = container.resolve(InjectTokens.LocalConfigRuntimeState);

      await expect(deploymentCommand.importConfig(buildImportArgv().build())).to.eventually.be.true;
      await expect(deploymentCommand.importConfig(buildImportArgv().build())).to.eventually.be.true;

      await localConfig.load();
      const imported: Deployment | undefined = localConfig.configuration.deployments.find(
        (deployment: Deployment): boolean => deployment.name === importedDeploymentName,
      );
      expect(imported?.clusters.map((cluster): string => cluster.toString())).to.deep.equal([importedClusterReference]);
    });

    it("should read the realm and shard from a consensus node's application.properties", async (): Promise<void> => {
      const applicationPropertiesContent: string = 'hedera.realm=3\nhedera.shard=2\n';
      k8Stub.pods = sinon.stub().returns({
        list: sinon
          .stub()
          .resolves([
            {podReference: PodReference.of(NamespaceName.of(importedNamespaceName), PodName.of('network-node1-0'))},
          ]),
      });
      k8Stub.containers = sinon.stub().returns({
        readByRef: sinon.stub().returns({execContainer: sinon.stub().resolves(applicationPropertiesContent)}),
      });

      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);
      const localConfig: LocalConfigRuntimeState = container.resolve(InjectTokens.LocalConfigRuntimeState);

      await expect(deploymentCommand.importConfig(buildImportArgv().build())).to.eventually.be.true;

      await localConfig.load();
      const imported: Deployment | undefined = localConfig.configuration.deployments.find(
        (deployment: Deployment): boolean => deployment.name === importedDeploymentName,
      );
      expect(imported?.realm).to.equal(3);
      expect(imported?.shard).to.equal(2);
    });

    it('should read the realm and shard from the shared data ConfigMap when no consensus node is running', async (): Promise<void> => {
      const sharedDataConfigMap: ConfigMap = {
        name: constants.NETWORK_NODE_SHARED_DATA_CONFIG_MAP_NAME,
        namespace: NamespaceName.of(importedNamespaceName),
        labels: {},
        data: {[constants.APPLICATION_PROPERTIES]: 'hedera.realm=5\nhedera.shard=1\n'},
      };
      const readStub: SinonStub = sinon.stub().resolves(remoteConfigMap);
      readStub
        .withArgs(sinon.match.any, constants.NETWORK_NODE_SHARED_DATA_CONFIG_MAP_NAME)
        .resolves(sharedDataConfigMap);
      k8Stub.configMaps = sinon.stub().returns({
        exists: configMapsStub,
        list: sinon.stub().resolves([remoteConfigMap]),
        listForAllNamespaces: sinon.stub().resolves([remoteConfigMap]),
        read: readStub,
      });
      k8Stub.pods = sinon.stub().returns({list: sinon.stub().resolves([])});

      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);
      const localConfig: LocalConfigRuntimeState = container.resolve(InjectTokens.LocalConfigRuntimeState);

      await expect(deploymentCommand.importConfig(buildImportArgv().build())).to.eventually.be.true;

      await localConfig.load();
      const imported: Deployment | undefined = localConfig.configuration.deployments.find(
        (deployment: Deployment): boolean => deployment.name === importedDeploymentName,
      );
      expect(imported?.realm).to.equal(5);
      expect(imported?.shard).to.equal(1);
    });

    it('should warn and fall back to the default realm and shard when they cannot be determined', async (): Promise<void> => {
      k8Stub.pods = sinon.stub().returns({list: sinon.stub().resolves([])});

      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);
      const localConfig: LocalConfigRuntimeState = container.resolve(InjectTokens.LocalConfigRuntimeState);
      const logger: SoloLogger = container.resolve(InjectTokens.SoloLogger);
      const showUserStub: SinonStub = sinon.stub(logger, 'showUser');

      await expect(deploymentCommand.importConfig(buildImportArgv().build())).to.eventually.be.true;

      expect(
        showUserStub.getCalls().some((call): boolean => String(call.args[0]).includes('realm')),
        'expected a warning about falling back to the default realm and shard',
      ).to.be.true;

      await localConfig.load();
      const imported: Deployment | undefined = localConfig.configuration.deployments.find(
        (deployment: Deployment): boolean => deployment.name === importedDeploymentName,
      );
      expect(imported?.realm).to.equal(0);
      expect(imported?.shard).to.equal(0);
    });

    it('should fail when no Solo deployment exists in the targeted context', async (): Promise<void> => {
      k8Stub.configMaps = sinon.stub().returns({
        exists: configMapsStub,
        list: sinon.stub().resolves([]),
        listForAllNamespaces: sinon.stub().resolves([]),
        read: sinon.stub().rejects(new Error('not found')),
      });

      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);

      await expect(deploymentCommand.importConfig(buildImportArgv().build())).to.be.rejectedWith(
        'no Solo deployment found',
      );
    });

    it('should not overwrite a conflicting local deployment in quiet mode', async (): Promise<void> => {
      const conflictingNamespaceName: string = 'different-namespace';
      const localConfig: LocalConfigRuntimeState = container.resolve(InjectTokens.LocalConfigRuntimeState);
      await localConfig.load();
      const conflicting: Deployment = localConfig.configuration.deployments.addNew();
      conflicting.name = importedDeploymentName;
      conflicting.namespace = conflictingNamespaceName;
      conflicting.realm = 0;
      conflicting.shard = 0;
      await localConfig.persist();

      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);

      await expect(deploymentCommand.importConfig(buildImportArgv().build())).to.be.rejectedWith('already exists');

      await localConfig.load();
      const untouched: Deployment | undefined = localConfig.configuration.deployments.find(
        (deployment: Deployment): boolean => deployment.name === importedDeploymentName,
      );
      expect(untouched?.namespace).to.equal(conflictingNamespaceName);
    });

    it('should regenerate a partial local config instead of failing on it', async (): Promise<void> => {
      const localConfigPath: string = PathEx.join('test', 'data', 'tmp', constants.DEFAULT_LOCAL_CONFIG_FILE);
      const partialContent: string = 'userIdentity:\n  name: john\n  hostname: localhost\n';
      fs.writeFileSync(localConfigPath, partialContent);

      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);
      const localConfig: LocalConfigRuntimeState = container.resolve(InjectTokens.LocalConfigRuntimeState);

      await expect(deploymentCommand.importConfig(buildImportArgv().build())).to.eventually.be.true;

      // The broken original must survive the regeneration as a backup, keeping manual repair possible.
      expect(fs.readFileSync(`${localConfigPath}.invalid`, 'utf8')).to.equal(partialContent);

      await localConfig.load();
      const imported: Deployment | undefined = localConfig.configuration.deployments.find(
        (deployment: Deployment): boolean => deployment.name === importedDeploymentName,
      );
      expect(imported).to.not.be.undefined;
      expect(imported?.namespace).to.equal(importedNamespaceName);
    });
  });

  describe('create() - deployment with no cluster refs is treated as stale', (): void => {
    it('should clean up stale deployment with no cluster refs and create fresh', async (): Promise<void> => {
      // Manually add a deployment with no cluster refs to local config
      const localConfig: LocalConfigRuntimeState = container.resolve(InjectTokens.LocalConfigRuntimeState);
      await localConfig.load();
      const noClusterDeploymentName: string = 'no-cluster-deployment';
      const noClusterNamespace: NamespaceName = NamespaceName.of('no-cluster-ns');
      const staleDeployment: Deployment = localConfig.configuration.deployments.addNew();
      staleDeployment.name = noClusterDeploymentName;
      staleDeployment.namespace = noClusterNamespace.name;
      staleDeployment.realm = 0;
      staleDeployment.shard = 0;
      await localConfig.persist();

      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);

      const argv: Argv = Argv.getDefaultArgv(noClusterNamespace);
      argv.setArg(flags.deployment, noClusterDeploymentName);
      argv.setArg(flags.namespace, noClusterNamespace.name);

      // Should succeed - deployment with no cluster refs is treated as stale
      await expect(deploymentCommand.create(argv.build())).to.eventually.be.true;
    });
  });

  describe('stopPortForwards()', (): void => {
    interface FakeComponent {
      metadata: {
        id: number;
        cluster: string;
        namespace: string;
        portForwardConfigs: {localPort: number; podPort: number}[];
      };
    }

    function buildRemoteConfigStub(components: {mirrorNodes?: FakeComponent[]; explorers?: FakeComponent[]}): {
      loadAndValidate: SinonStub;
      persist: SinonStub;
      configuration: {state: Record<string, FakeComponent[]>};
    } {
      return {
        loadAndValidate: sinon.stub().resolves(),
        persist: sinon.stub().resolves(),
        configuration: {
          state: {
            consensusNodes: [],
            haProxies: [],
            blockNodes: [],
            mirrorNodes: components.mirrorNodes ?? [],
            relayNodes: [],
            explorers: components.explorers ?? [],
          },
        },
      };
    }

    it('should stop each configured port-forward, clear its config, and persist', async (): Promise<void> => {
      const stopPortForwardStub: SinonStub = sinon.stub().resolves();
      k8Stub.pods = sinon.stub().returns({
        readByReference: sinon.stub().returns({stopPortForward: stopPortForwardStub}),
      }) as unknown as K8['pods'];

      const mirrorComponent: FakeComponent = {
        metadata: {
          id: 1,
          cluster: 'cluster-1',
          namespace: namespace.name,
          portForwardConfigs: [{localPort: 5551, podPort: 5600}],
        },
      };
      const remoteConfigStub: ReturnType<typeof buildRemoteConfigStub> = buildRemoteConfigStub({
        mirrorNodes: [mirrorComponent],
      });

      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);
      (deploymentCommand as unknown as {remoteConfig: unknown}).remoteConfig = remoteConfigStub;

      const argv: Argv = Argv.getDefaultArgv(namespace);
      argv.setArg(flags.deployment, deploymentName);

      await expect(deploymentCommand.stopPortForwards(argv.build())).to.eventually.be.true;

      expect(stopPortForwardStub.calledOnceWith(5551)).to.be.true;
      expect(remoteConfigStub.persist.calledOnce).to.be.true;
      expect(mirrorComponent.metadata.portForwardConfigs).to.have.lengthOf(0);
    });

    it('should not persist when no port-forwards are configured', async (): Promise<void> => {
      const stopPortForwardStub: SinonStub = sinon.stub().resolves();
      k8Stub.pods = sinon.stub().returns({
        readByReference: sinon.stub().returns({stopPortForward: stopPortForwardStub}),
      }) as unknown as K8['pods'];

      const remoteConfigStub: ReturnType<typeof buildRemoteConfigStub> = buildRemoteConfigStub({});

      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);
      (deploymentCommand as unknown as {remoteConfig: unknown}).remoteConfig = remoteConfigStub;

      const argv: Argv = Argv.getDefaultArgv(namespace);
      argv.setArg(flags.deployment, deploymentName);

      await expect(deploymentCommand.stopPortForwards(argv.build())).to.eventually.be.true;

      expect(stopPortForwardStub.called).to.be.false;
      expect(remoteConfigStub.persist.called).to.be.false;
    });

    it('should retain the config for a port-forward that fails to stop', async (): Promise<void> => {
      const stopPortForwardStub: SinonStub = sinon.stub().rejects(new Error('kill failed'));
      k8Stub.pods = sinon.stub().returns({
        readByReference: sinon.stub().returns({stopPortForward: stopPortForwardStub}),
      }) as unknown as K8['pods'];

      const explorerComponent: FakeComponent = {
        metadata: {
          id: 2,
          cluster: 'cluster-1',
          namespace: namespace.name,
          portForwardConfigs: [{localPort: 8080, podPort: 8080}],
        },
      };
      const remoteConfigStub: ReturnType<typeof buildRemoteConfigStub> = buildRemoteConfigStub({
        explorers: [explorerComponent],
      });

      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);
      (deploymentCommand as unknown as {remoteConfig: unknown}).remoteConfig = remoteConfigStub;

      const argv: Argv = Argv.getDefaultArgv(namespace);
      argv.setArg(flags.deployment, deploymentName);

      await expect(deploymentCommand.stopPortForwards(argv.build())).to.eventually.be.true;

      // Nothing stopped successfully, so the config is preserved and no persist happens.
      expect(remoteConfigStub.persist.called).to.be.false;
      expect(explorerComponent.metadata.portForwardConfigs).to.have.lengthOf(1);
    });
  });
});
