/**
 * SPDX-License-Identifier: Apache-2.0
 */
import sinon from 'sinon';
import {beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';

import {ClusterCommand} from '../../../src/commands/cluster/index.js';
import {getTestCacheDir, HEDERA_PLATFORM_VERSION_TAG, TEST_CLUSTER, testLocalConfigData} from '../../test_util.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import * as version from '../../../version.js';
import * as constants from '../../../src/core/constants.js';
import {ConfigManager} from '../../../src/core/config_manager.js';
import {SoloLogger} from '../../../src/core/logging.js';
import {ChartManager} from '../../../src/core/chart_manager.js';
import {Helm} from '../../../src/core/helm.js';
import {ROOT_DIR} from '../../../src/core/constants.js';
import path from 'path';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test_container.js';
import {ClusterCommandTasks} from '../../../src/commands/cluster/tasks.js';
import {type BaseCommand, type Opts} from '../../../src/commands/base.js';
import {LocalConfig} from '../../../src/core/config/local_config.js';
import {type CommandFlag} from '../../../src/types/flag_types.js';
import {K8Client} from '../../../src/core/kube/k8_client/k8_client.js';
import {K8ClientFactory} from '../../../src/core/kube/k8_client/k8_client_factory.js';
import {type Cluster, KubeConfig} from '@kubernetes/client-node';
import {RemoteConfigManager} from '../../../src/core/config/remote/remote_config_manager.js';
import {DependencyManager} from '../../../src/core/dependency_managers/index.js';
import {PackageDownloader} from '../../../src/core/package_downloader.js';
import {KeyManager} from '../../../src/core/key_manager.js';
import {AccountManager} from '../../../src/core/account_manager.js';
import {PlatformInstaller} from '../../../src/core/platform_installer.js';
import {ProfileManager} from '../../../src/core/profile_manager.js';
import {LeaseManager} from '../../../src/core/lease/lease_manager.js';
import {CertificateManager} from '../../../src/core/certificate_manager.js';
import {type ListrTaskWrapper} from 'listr2';
import fs from 'fs';
import {stringify} from 'yaml';
import {ErrorMessages} from '../../../src/core/error_messages.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace_name.js';
import {ClusterChecks} from '../../../src/core/cluster_checks.js';
import {K8ClientClusters} from '../../../src/core/kube/k8_client/resources/cluster/k8_client_clusters.js';
import {K8ClientContexts} from '../../../src/core/kube/k8_client/resources/context/k8_client_contexts.js';
import {InjectTokens} from '../../../src/core/dependency_injection/inject_tokens.js';
import {Argv} from '../../helpers/argv_wrapper.js';
import {K8ClientNamespaces} from '../../../src/core/kube/k8_client/resources/namespace/k8_client_namespaces.js';

const getBaseCommandOpts = (context: string) => {
  const opts = {
    logger: sandbox.createStubInstance(SoloLogger),
    helm: sandbox.createStubInstance(Helm),
    k8Factory: sandbox.createStubInstance(K8ClientFactory),
    chartManager: sandbox.createStubInstance(ChartManager),
    configManager: sandbox.createStubInstance(ConfigManager),
    depManager: sandbox.createStubInstance(DependencyManager),
    localConfig: sandbox.createStubInstance(LocalConfig),
  };
  opts.k8Factory.default.returns(new K8Client(context));
  return opts;
};

const testName = 'cluster-cmd-unit';
const namespace = NamespaceName.of(testName);
const argv = Argv.getDefaultArgv(namespace);
const sandbox = sinon.createSandbox();

argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.deployment, `${namespace.name}-deployment`);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.nodeAliasesUnparsed, 'node1');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, TEST_CLUSTER);
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.force, true);
argv.setArg(flags.clusterSetupNamespace, constants.SOLO_SETUP_NAMESPACE.name);

describe('ClusterCommand unit tests', () => {
  before(() => {
    resetForTest(namespace.name);
  });

  describe('Chart Install Function is called correctly', () => {
    let opts: any;

    afterEach(() => {
      sandbox.restore();
    });

    beforeEach(() => {
      const k8Client = new K8Client(undefined);
      const context = k8Client.contexts().readCurrent();
      opts = getBaseCommandOpts(context);
      opts.logger = container.resolve(InjectTokens.SoloLogger);
      opts.helm = container.resolve(InjectTokens.Helm);
      opts.chartManager = container.resolve(InjectTokens.ChartManager);
      opts.helm.dependency = sandbox.stub();

      opts.chartManager.isChartInstalled = sandbox.stub().returns(false);
      opts.chartManager.install = sandbox.stub().returns(true);

      opts.configManager = container.resolve(InjectTokens.ConfigManager);
      opts.remoteConfigManager = sandbox.stub();

      opts.remoteConfigManager.currentCluster = 'solo-e2e';
      opts.localConfig.clusterRefs = {'solo-e2e': 'context-1'};
    });

    it('Install function is called with expected parameters', async () => {
      const clusterCommand = new ClusterCommand(opts);
      await clusterCommand.handlers.setup(argv.build());

      expect(opts.chartManager.install.args[0][0].name).to.equal(constants.SOLO_SETUP_NAMESPACE.name);
      expect(opts.chartManager.install.args[0][1]).to.equal(constants.SOLO_CLUSTER_SETUP_CHART);
      expect(opts.chartManager.install.args[0][2]).to.equal(
        constants.SOLO_TESTING_CHART_URL + '/' + constants.SOLO_CLUSTER_SETUP_CHART,
      );
      expect(opts.chartManager.install.args[0][3]).to.equal(version.SOLO_CHART_VERSION);
    });

    it('Should use local chart directory', async () => {
      argv.setArg(flags.chartDirectory, 'test-directory');
      argv.setArg(flags.force, true);

      const clusterCommand = new ClusterCommand(opts);
      await clusterCommand.handlers.setup(argv.build());

      expect(opts.chartManager.install.args[0][2]).to.equal(
        path.join(ROOT_DIR, 'test-directory', constants.SOLO_CLUSTER_SETUP_CHART),
      );
    });
  });

  describe('cluster connect', () => {
    const filePath = `${getTestCacheDir('ClusterCommandTasks')}/localConfig.yaml`;
    const sandbox = sinon.createSandbox();
    let namespacePromptStub: sinon.SinonStub;
    let clusterNamePromptStub: sinon.SinonStub;
    let deploymentPromptStub: sinon.SinonStub;
    let contextPromptStub: sinon.SinonStub;
    let tasks: ClusterCommandTasks;
    let command: BaseCommand;
    let loggerStub: sinon.SinonStubbedInstance<SoloLogger>;
    let k8FactoryStub: sinon.SinonStubbedInstance<K8ClientFactory>;
    let remoteConfigManagerStub: sinon.SinonStubbedInstance<RemoteConfigManager>;
    let localConfig: LocalConfig;
    const defaultRemoteConfig = {
      metadata: {
        namespace: 'solo-e2e',
      },
      clusters: {},
    };

    const getBaseCommandOpts = (
      sandbox: sinon.SinonSandbox,
      remoteConfig: any = {},
      // @ts-expect-error - TS2344: Type CommandFlag does not satisfy the constraint string | number | symbol
      stubbedFlags: Record<CommandFlag, any>[] = [],
      opts: any = {
        testContextConnectionError: false,
      },
    ) => {
      const loggerStub = sandbox.createStubInstance(SoloLogger);
      k8FactoryStub = sandbox.createStubInstance(K8ClientFactory);
      const k8Stub = sandbox.createStubInstance(K8Client);
      k8FactoryStub.default.returns(k8Stub);
      const k8ContextsStub = sandbox.createStubInstance(K8ClientContexts);
      k8ContextsStub.list.returns(['context-1', 'context-2', 'context-3']);
      k8Stub.contexts.returns(k8ContextsStub);
      const clusterChecksStub = sandbox.createStubInstance(ClusterChecks);
      clusterChecksStub.isMinioInstalled.returns(new Promise<boolean>(() => true));
      clusterChecksStub.isPrometheusInstalled.returns(new Promise<boolean>(() => true));
      clusterChecksStub.isCertManagerInstalled.returns(new Promise<boolean>(() => true));

      if (opts.testContextConnectionError) {
        k8ContextsStub.testContextConnection.resolves(false);
      } else {
        k8ContextsStub.testContextConnection.resolves(true);
      }

      const kubeConfigClusterObject = {
        name: 'cluster-3',
        caData: 'caData',
        caFile: 'caFile',
        server: 'server-3',
        skipTLSVerify: true,
        tlsServerName: 'tls-3',
      } as Cluster;

      const kubeConfigStub = sandbox.createStubInstance(KubeConfig);
      kubeConfigStub.getCurrentContext.returns('context-from-kubeConfig');
      kubeConfigStub.getCurrentCluster.returns(kubeConfigClusterObject);

      remoteConfigManagerStub = sandbox.createStubInstance(RemoteConfigManager);
      remoteConfigManagerStub.modify.callsFake(async callback => {
        await callback(remoteConfig);
      });
      remoteConfigManagerStub.get.resolves(remoteConfig);

      const k8ClustersStub = sandbox.createStubInstance(K8ClientClusters);
      k8ClustersStub.readCurrent.returns(kubeConfigClusterObject.name);
      k8Stub.clusters.returns(k8ClustersStub);
      k8ContextsStub.readCurrent.returns('context-from-kubeConfig');

      const configManager = sandbox.createStubInstance(ConfigManager);

      for (let i = 0; i < stubbedFlags.length; i++) {
        configManager.getFlag.withArgs(stubbedFlags[i][0]).returns(stubbedFlags[i][1]);
      }

      container.unregister(InjectTokens.RemoteConfigManager);
      container.registerInstance(InjectTokens.RemoteConfigManager, remoteConfigManagerStub);

      container.unregister(InjectTokens.K8Factory);
      container.registerInstance(InjectTokens.K8Factory, k8FactoryStub);

      const localConfig = new LocalConfig(filePath);
      container.unregister(InjectTokens.LocalConfig);
      container.registerInstance(InjectTokens.LocalConfig, localConfig);

      container.unregister(InjectTokens.ConfigManager);
      container.registerInstance(InjectTokens.ConfigManager, configManager);

      container.unregister(InjectTokens.SoloLogger);
      container.registerInstance(InjectTokens.SoloLogger, loggerStub);

      const options = {
        logger: loggerStub,
        helm: sandbox.createStubInstance(Helm),
        k8Factory: k8FactoryStub,
        chartManager: sandbox.createStubInstance(ChartManager),
        configManager,
        depManager: sandbox.createStubInstance(DependencyManager),
        localConfig: new LocalConfig(filePath),
        downloader: sandbox.createStubInstance(PackageDownloader),
        keyManager: sandbox.createStubInstance(KeyManager),
        accountManager: sandbox.createStubInstance(AccountManager),
        platformInstaller: sandbox.createStubInstance(PlatformInstaller),
        profileManager: sandbox.createStubInstance(ProfileManager),
        leaseManager: sandbox.createStubInstance(LeaseManager),
        certificateManager: sandbox.createStubInstance(CertificateManager),
        remoteConfigManager: remoteConfigManagerStub,
      } as Opts;

      return options;
    };

    describe('updateLocalConfig', () => {
      async function runUpdateLocalConfigTask(opts) {
        command = new ClusterCommand(opts);

        tasks = container.resolve(ClusterCommandTasks);

        const taskObj = tasks.updateLocalConfig();

        await taskObj.task({config: {}} as any, sandbox.stub() as unknown as ListrTaskWrapper<any, any, any>);
        return command;
      }

      afterEach(async () => {
        await fs.promises.unlink(filePath);
        sandbox.restore();
      });

      after(() => {});

      beforeEach(async () => {
        namespacePromptStub = sandbox.stub(flags.namespace, 'prompt').callsFake(() => {
          return new Promise(resolve => {
            resolve('deployment-3');
          });
        });
        deploymentPromptStub = sandbox.stub(flags.deployment, 'prompt').callsFake(() => {
          return new Promise(resolve => {
            resolve('deployment-3');
          });
        });
        clusterNamePromptStub = sandbox.stub(flags.clusterRef, 'prompt').callsFake(() => {
          return new Promise(resolve => {
            resolve('cluster-3');
          });
        });
        contextPromptStub = sandbox.stub(flags.context, 'prompt').callsFake(() => {
          return new Promise(resolve => {
            resolve('context-3');
          });
        });
        loggerStub = sandbox.createStubInstance(SoloLogger);
        await fs.promises.writeFile(filePath, stringify(testLocalConfigData));
      });

      it('should update currentDeployment with clusters from remoteConfig', async () => {
        const remoteConfig = Object.assign({}, defaultRemoteConfig, {
          clusters: {
            'cluster-2': 'solo-e2e',
          },
        });

        const opts = getBaseCommandOpts(sandbox, remoteConfig, []);
        command = await runUpdateLocalConfigTask(opts);
        localConfig = new LocalConfig(filePath);

        expect(localConfig.clusterRefs).to.deep.equal({
          'cluster-1': 'context-1',
          'cluster-2': 'context-2',
        });
      });

      xit('should update clusterRefs with provided context', async () => {
        const remoteConfig = Object.assign({}, defaultRemoteConfig, {
          clusters: {
            'cluster-2': 'deployment',
          },
        });
        const opts = getBaseCommandOpts(sandbox, remoteConfig, [[flags.context, 'provided-context']]);
        command = await runUpdateLocalConfigTask(opts);
        localConfig = new LocalConfig(filePath);

        expect(localConfig.clusterRefs).to.deep.equal({
          'cluster-1': 'context-1',
          'cluster-2': 'provided-context',
        });
      });

      xit('should update multiple clusterRefss with provided contexts', async () => {
        const remoteConfig = Object.assign({}, defaultRemoteConfig, {
          clusters: {
            'cluster-2': 'deployment',
            'cluster-3': 'deployment',
            'cluster-4': 'deployment',
          },
        });
        const opts = getBaseCommandOpts(sandbox, remoteConfig, [
          [flags.context, 'provided-context-2,provided-context-3,provided-context-4'],
        ]);
        command = await runUpdateLocalConfigTask(opts);
        localConfig = new LocalConfig(filePath);

        expect(localConfig.clusterRefs).to.deep.equal({
          'cluster-1': 'context-1',
          'cluster-2': 'provided-context-2',
          'cluster-3': 'provided-context-3',
          'cluster-4': 'provided-context-4',
        });
      });

      xit('should update multiple clusterRefss with default KubeConfig context if quiet=true', async () => {
        const remoteConfig = Object.assign({}, defaultRemoteConfig, {
          clusters: {
            'cluster-2': 'deployment',
            'cluster-3': 'deployment',
          },
        });
        const opts = getBaseCommandOpts(sandbox, remoteConfig, [[flags.quiet, true]]);
        command = await runUpdateLocalConfigTask(opts);
        localConfig = new LocalConfig(filePath);

        expect(localConfig.clusterRefs).to.deep.equal({
          'cluster-1': 'context-1',
          'cluster-2': 'context-2',
          'cluster-3': 'context-from-kubeConfig',
        });
      });

      xit('should update multiple clusterRefss with prompted context no value was provided', async () => {
        const remoteConfig = Object.assign({}, defaultRemoteConfig, {
          clusters: {
            'cluster-2': 'deployment',
            'new-cluster': 'deployment',
          },
        });
        const opts = getBaseCommandOpts(sandbox, remoteConfig, []);

        command = await runUpdateLocalConfigTask(opts);
        localConfig = new LocalConfig(filePath);

        expect(localConfig.clusterRefs).to.deep.equal({
          'cluster-1': 'context-1',
          'cluster-2': 'context-2',
          'new-cluster': 'context-3', // prompted value
        });
      });
    });

    describe('selectContext', () => {
      async function runSelectContextTask(opts) {
        command = new ClusterCommand(opts);

        tasks = container.resolve(ClusterCommandTasks);

        // @ts-expect-error - TS2554: Expected 0 arguments, but got 1
        const taskObj = tasks.selectContext({});

        await taskObj.task({config: {}} as any, sandbox.stub() as unknown as ListrTaskWrapper<any, any, any>);
        return command;
      }

      afterEach(async () => {
        await fs.promises.unlink(filePath);
        sandbox.restore();
      });

      beforeEach(async () => {
        namespacePromptStub = sandbox.stub(flags.namespace, 'prompt').callsFake(() => {
          return new Promise(resolve => {
            resolve('deployment-3');
          });
        });
        clusterNamePromptStub = sandbox.stub(flags.clusterRef, 'prompt').callsFake(() => {
          return new Promise(resolve => {
            resolve('cluster-3');
          });
        });
        contextPromptStub = sandbox.stub(flags.context, 'prompt').callsFake(() => {
          return new Promise(resolve => {
            resolve('context-3');
          });
        });
        loggerStub = sandbox.createStubInstance(SoloLogger);
        await fs.promises.writeFile(filePath, stringify(testLocalConfigData));
      });

      it('should use first provided context', async () => {
        const opts = getBaseCommandOpts(sandbox, {}, [
          [flags.context, 'provided-context-1,provided-context-2,provided-context-3'],
        ]);

        command = await runSelectContextTask(opts); // @ts-ignore
        expect(command.getK8Factory().default().contexts().updateCurrent).to.have.been.calledWith('provided-context-1');
      });

      it('should use local config mapping to connect to first provided cluster', async () => {
        const opts = getBaseCommandOpts(sandbox, {}, [[flags.clusterRef, 'cluster-2,cluster-3']]);

        command = await runSelectContextTask(opts); // @ts-ignore
        expect(command.getK8Factory().default().contexts().updateCurrent).to.have.been.calledWith('context-2');
      });

      it('should prompt for context if selected cluster is not found in local config mapping', async () => {
        const opts = getBaseCommandOpts(sandbox, {}, [[flags.clusterRef, 'cluster-3']]);

        command = await runSelectContextTask(opts); // @ts-ignore
        expect(command.getK8Factory().default().contexts().updateCurrent).to.have.been.calledWith('context-3');
      });

      it('should use default kubeConfig context if selected cluster is not found in local config mapping and quiet=true', async () => {
        const opts = getBaseCommandOpts(sandbox, {}, [
          [flags.clusterRef, 'unknown-cluster'],
          [flags.quiet, true],
        ]);

        command = await runSelectContextTask(opts); // @ts-ignore
        expect(command.getK8Factory().default().contexts().updateCurrent).to.have.been.calledWith(
          'context-from-kubeConfig',
        );
      });

      it('should use context from local config mapping for the first cluster from the selected deployment', async () => {
        const opts = getBaseCommandOpts(sandbox, {}, [[flags.deployment, 'deployment-2']]);

        command = await runSelectContextTask(opts); // @ts-ignore
        expect(command.getK8Factory().default().contexts().updateCurrent).to.have.been.calledWith('context-2');
      });

      it('should prompt for context if selected deployment is found in local config but the context is not', async () => {
        const opts = getBaseCommandOpts(sandbox, {}, [[flags.deployment, 'deployment-3']]);

        command = await runSelectContextTask(opts); // @ts-ignore
        expect(command.getK8Factory().default().contexts().updateCurrent).to.have.been.calledWith('context-3');
      });

      it('should use default context if selected deployment is found in local config but the context is not and quiet=true', async () => {
        const opts = getBaseCommandOpts(sandbox, {}, [
          [flags.deployment, 'deployment-3'],
          [flags.quiet, true],
        ]);

        command = await runSelectContextTask(opts); // @ts-ignore
        expect(command.getK8Factory().default().contexts().updateCurrent).to.have.been.calledWith(
          'context-from-kubeConfig',
        );
      });

      it('should prompt for clusters and contexts if selected deployment is not found in local config', async () => {
        const opts = getBaseCommandOpts(sandbox, {}, [[flags.deployment, 'deployment-4']]);

        command = await runSelectContextTask(opts);
        expect(command.getK8Factory().default().contexts().updateCurrent).to.have.been.calledWith('context-3');
      });

      it('should use clusters and contexts from kubeConfig if selected deployment is not found in local config and quiet=true', async () => {
        const opts = getBaseCommandOpts(sandbox, {}, [
          [flags.deployment, 'deployment-4'],
          [flags.quiet, true],
        ]);

        command = await runSelectContextTask(opts);
        expect(command.getK8Factory().default().contexts().updateCurrent).to.have.been.calledWith(
          'context-from-kubeConfig',
        );
      });

      it('throws error when context is invalid', async () => {
        const opts = getBaseCommandOpts(sandbox, {}, [[flags.context, 'invalid-context']], {
          testContextConnectionError: true,
        });

        try {
          await runSelectContextTask(opts);
          expect(true).to.be.false;
        } catch (e) {
          expect(e.message).to.eq(ErrorMessages.INVALID_CONTEXT_FOR_CLUSTER('invalid-context'));
        }
      });
    });
  });
});
