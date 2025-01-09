/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import sinon from 'sinon';
import {describe, it, beforeEach} from 'mocha';
import {expect} from 'chai';

import {ClusterCommand} from '../../../src/commands/cluster/index.js';
import {
  getDefaultArgv,
  getTestCacheDir,
  HEDERA_PLATFORM_VERSION_TAG,
  TEST_CLUSTER,
  testLocalConfigData,
} from '../../test_util.js';
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
import {resetTestContainer} from '../../test_container.js';
import * as test from 'node:test';
import {ClusterCommandTasks} from '../../../src/commands/cluster/tasks.js';
import type {BaseCommand} from '../../../src/commands/base.js';
import {LocalConfig} from '../../../src/core/config/local_config.js';
import type {CommandFlag} from '../../../src/types/flag_types.js';
import {K8} from '../../../src/core/k8.js';
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
import type {Opts} from '../../../src/types/command_types.js';
import type {ListrTaskWrapper} from 'listr2';
import fs from 'fs';
import {stringify} from 'yaml';

const getBaseCommandOpts = () => ({
  logger: sinon.stub(),
  helm: sinon.stub(),
  k8: {
    isMinioInstalled: sinon.stub().returns(false),
    isPrometheusInstalled: sinon.stub().returns(false),
    isCertManagerInstalled: sinon.stub().returns(false),
  },
  chartManager: sinon.stub(),
  configManager: sinon.stub(),
  depManager: sinon.stub(),
  localConfig: sinon.stub(),
});

const testName = 'cluster-cmd-unit';
const namespace = testName;
const argv = getDefaultArgv();

argv[flags.namespace.name] = namespace;
argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG;
argv[flags.nodeAliasesUnparsed.name] = 'node1';
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
argv[flags.clusterName.name] = TEST_CLUSTER;
argv[flags.soloChartVersion.name] = version.SOLO_CHART_VERSION;
argv[flags.force.name] = true;
argv[flags.clusterSetupNamespace.name] = constants.SOLO_SETUP_NAMESPACE;

describe('ClusterCommand unit tests', () => {
  before(() => {
    resetTestContainer();
  });

  describe('Chart Install Function is called correctly', () => {
    let opts: any;

    beforeEach(() => {
      opts = getBaseCommandOpts();
      opts.logger = container.resolve(SoloLogger);
      opts.helm = container.resolve(Helm);
      opts.chartManager = container.resolve(ChartManager);
      opts.helm.dependency = sinon.stub();

      opts.chartManager.isChartInstalled = sinon.stub().returns(false);
      opts.chartManager.install = sinon.stub().returns(true);

      opts.configManager = container.resolve(ConfigManager);
      opts.remoteConfigManager = sinon.stub();
    });

    it('Install function is called with expected parameters', async () => {
      const clusterCommand = new ClusterCommand(opts);
      await clusterCommand.handlers.setup(argv);

      expect(opts.chartManager.install.args[0][0]).to.equal(constants.SOLO_SETUP_NAMESPACE);
      expect(opts.chartManager.install.args[0][1]).to.equal(constants.SOLO_CLUSTER_SETUP_CHART);
      expect(opts.chartManager.install.args[0][2]).to.equal(
        constants.SOLO_TESTING_CHART_URL + '/' + constants.SOLO_CLUSTER_SETUP_CHART,
      );
      expect(opts.chartManager.install.args[0][3]).to.equal(version.SOLO_CHART_VERSION);
    });

    it('Should use local chart directory', async () => {
      argv[flags.chartDirectory.name] = 'test-directory';
      argv[flags.force.name] = true;

      const clusterCommand = new ClusterCommand(opts);
      await clusterCommand.handlers.setup(argv);

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
    let contextPromptStub: sinon.SinonStub;
    let tasks: ClusterCommandTasks;
    let command: BaseCommand;
    let loggerStub: sinon.SinonStubbedInstance<SoloLogger>;
    let localConfig: LocalConfig;

    const getBaseCommandOpts = (
      sandbox: sinon.SinonSandbox,
      remoteConfig: any = {},
      // @ts-ignore
      stubbedFlags: Record<CommandFlag, any>[] = [],
    ) => {
      const loggerStub = sandbox.createStubInstance(SoloLogger);
      const k8Stub = sandbox.createStubInstance(K8);
      k8Stub.getContexts.returns([
        {cluster: 'cluster-1', user: 'user-1', name: 'context-1', namespace: 'deployment-1'},
        {cluster: 'cluster-2', user: 'user-2', name: 'context-2', namespace: 'deployment-2'},
        {cluster: 'cluster-3', user: 'user-3', name: 'context-3', namespace: 'deployment-3'},
      ]);
      k8Stub.isMinioInstalled.returns(new Promise<boolean>(() => true));
      k8Stub.isPrometheusInstalled.returns(new Promise<boolean>(() => true));
      k8Stub.isCertManagerInstalled.returns(new Promise<boolean>(() => true));
      const kubeConfigStub = sandbox.createStubInstance(KubeConfig);
      kubeConfigStub.getCurrentContext.returns('context-from-kubeConfig');
      kubeConfigStub.getCurrentCluster.returns({
        name: 'cluster-3',
        caData: 'caData',
        caFile: 'caFile',
        server: 'server-3',
        skipTLSVerify: true,
        tlsServerName: 'tls-3',
      } as Cluster);

      const remoteConfigManagerStub = sandbox.createStubInstance(RemoteConfigManager);
      remoteConfigManagerStub.modify.callsFake(async callback => {
        await callback(remoteConfig);
      });

      k8Stub.getKubeConfig.returns(kubeConfigStub);

      const configManager = sandbox.createStubInstance(ConfigManager);

      for (let i = 0; i < stubbedFlags.length; i++) {
        configManager.getFlag.withArgs(stubbedFlags[i][0]).returns(stubbedFlags[i][1]);
      }

      return {
        logger: loggerStub,
        helm: sandbox.createStubInstance(Helm),
        k8: k8Stub,
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
    };

    describe('updateLocalConfig', () => {
      async function runUpdateLocalConfigTask(opts) {
        command = new ClusterCommand(opts);
        tasks = new ClusterCommandTasks(command, opts.k8);
        const taskObj = tasks.updateLocalConfig({});
        await taskObj.task({config: {}}, sandbox.stub() as unknown as ListrTaskWrapper<any, any, any>);
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
        clusterNamePromptStub = sandbox.stub(flags.clusterName, 'prompt').callsFake(() => {
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
        const remoteConfig = {
          clusters: {
            'cluster-2': 'deployment',
          },
        };
        const opts = getBaseCommandOpts(sandbox, remoteConfig, []);
        command = await runUpdateLocalConfigTask(opts); // @ts-ignore
        localConfig = new LocalConfig(filePath);

        expect(localConfig.currentDeploymentName).to.equal('deployment');
        expect(localConfig.getCurrentDeployment().clusters).to.deep.equal(['cluster-2']);
        expect(localConfig.clusterContextMapping).to.deep.equal({
          'cluster-1': 'context-1',
          'cluster-2': 'context-2',
        });
      });

      it('should update clusterContextMapping with provided context', async () => {
        const remoteConfig = {
          clusters: {
            'cluster-2': 'deployment',
          },
        };
        const opts = getBaseCommandOpts(sandbox, remoteConfig, [[flags.context, 'provided-context']]);
        command = await runUpdateLocalConfigTask(opts); // @ts-ignore
        localConfig = new LocalConfig(filePath);

        expect(localConfig.currentDeploymentName).to.equal('deployment');
        expect(localConfig.getCurrentDeployment().clusters).to.deep.equal(['cluster-2']);
        expect(localConfig.clusterContextMapping).to.deep.equal({
          'cluster-1': 'context-1',
          'cluster-2': 'provided-context',
        });
      });

      it('should update multiple clusterContextMappings with provided contexts', async () => {
        const remoteConfig = {
          clusters: {
            'cluster-2': 'deployment',
            'cluster-3': 'deployment',
            'cluster-4': 'deployment',
          },
        };
        const opts = getBaseCommandOpts(sandbox, remoteConfig, [
          [flags.context, 'provided-context-2,provided-context-3,provided-context-4'],
        ]);
        command = await runUpdateLocalConfigTask(opts); // @ts-ignore
        localConfig = new LocalConfig(filePath);

        expect(localConfig.currentDeploymentName).to.equal('deployment');
        expect(localConfig.getCurrentDeployment().clusters).to.deep.equal(['cluster-2', 'cluster-3', 'cluster-4']);
        expect(localConfig.clusterContextMapping).to.deep.equal({
          'cluster-1': 'context-1',
          'cluster-2': 'provided-context-2',
          'cluster-3': 'provided-context-3',
          'cluster-4': 'provided-context-4',
        });
      });

      it('should update multiple clusterContextMappings with default KubeConfig context if quiet=true', async () => {
        const remoteConfig = {
          clusters: {
            'cluster-2': 'deployment',
            'cluster-3': 'deployment',
          },
        };
        const opts = getBaseCommandOpts(sandbox, remoteConfig, [[flags.quiet, true]]);
        command = await runUpdateLocalConfigTask(opts); // @ts-ignore
        localConfig = new LocalConfig(filePath);

        expect(localConfig.currentDeploymentName).to.equal('deployment');
        expect(localConfig.getCurrentDeployment().clusters).to.deep.equal(['cluster-2', 'cluster-3']);
        expect(localConfig.clusterContextMapping).to.deep.equal({
          'cluster-1': 'context-1',
          'cluster-2': 'context-2',
          'cluster-3': 'context-from-kubeConfig',
        });
      });

      it('should update multiple clusterContextMappings with prompted context no value was provided', async () => {
        const remoteConfig = {
          clusters: {
            'cluster-2': 'deployment',
            'new-cluster': 'deployment',
          },
        };
        const opts = getBaseCommandOpts(sandbox, remoteConfig, []);

        command = await runUpdateLocalConfigTask(opts); // @ts-ignore
        localConfig = new LocalConfig(filePath);

        expect(localConfig.currentDeploymentName).to.equal('deployment');
        expect(localConfig.getCurrentDeployment().clusters).to.deep.equal(['cluster-2', 'new-cluster']);
        expect(localConfig.clusterContextMapping).to.deep.equal({
          'cluster-1': 'context-1',
          'cluster-2': 'context-2',
          'new-cluster': 'context-3', // prompted value
        });
      });
    });

    describe('selectContext', () => {
      async function runSelectContextTask(opts) {
        command = new ClusterCommand(opts);
        tasks = new ClusterCommandTasks(command, opts.k8);
        const taskObj = tasks.selectContext({});
        await taskObj.task({config: {}}, sandbox.stub() as unknown as ListrTaskWrapper<any, any, any>);
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
        clusterNamePromptStub = sandbox.stub(flags.clusterName, 'prompt').callsFake(() => {
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
        expect(command.getK8().getKubeConfig().setCurrentContext).to.have.been.calledWith('provided-context-1');
      });

      it('should use local config mapping to connect to first provided cluster', async () => {
        const opts = getBaseCommandOpts(sandbox, {}, [[flags.clusterName, 'cluster-2,cluster-3']]);

        command = await runSelectContextTask(opts); // @ts-ignore
        expect(command.getK8().getKubeConfig().setCurrentContext).to.have.been.calledWith('context-2');
      });

      it('should prompt for context if selected cluster is not found in local config mapping', async () => {
        const opts = getBaseCommandOpts(sandbox, {}, [[flags.clusterName, 'cluster-3']]);

        command = await runSelectContextTask(opts); // @ts-ignore
        expect(command.getK8().getKubeConfig().setCurrentContext).to.have.been.calledWith('context-3');
      });

      it('should use default kubeConfig context if selected cluster is not found in local config mapping and quiet=true', async () => {
        const opts = getBaseCommandOpts(sandbox, {}, [
          [flags.clusterName, 'unknown-cluster'],
          [flags.quiet, true],
        ]);

        command = await runSelectContextTask(opts); // @ts-ignore
        expect(command.getK8().getKubeConfig().setCurrentContext).to.have.been.calledWith('context-from-kubeConfig');
      });

      it('should use context from local config mapping for the first cluster from the selected deployment', async () => {
        const opts = getBaseCommandOpts(sandbox, {}, [[flags.namespace, 'deployment-2']]);

        command = await runSelectContextTask(opts); // @ts-ignore
        expect(command.getK8().getKubeConfig().setCurrentContext).to.have.been.calledWith('context-2');
      });

      it('should prompt for context if selected deployment is found in local config but the context is not', async () => {
        const opts = getBaseCommandOpts(sandbox, {}, [[flags.namespace, 'deployment-3']]);

        command = await runSelectContextTask(opts); // @ts-ignore
        expect(command.getK8().getKubeConfig().setCurrentContext).to.have.been.calledWith('context-3');
      });

      it('should use default context if selected deployment is found in local config but the context is not and quiet=true', async () => {
        const opts = getBaseCommandOpts(sandbox, {}, [
          [flags.namespace, 'deployment-3'],
          [flags.quiet, true],
        ]);

        command = await runSelectContextTask(opts); // @ts-ignore
        expect(command.getK8().getKubeConfig().setCurrentContext).to.have.been.calledWith('context-from-kubeConfig');
      });

      it('should prompt for clusters and contexts if selected deployment is not found in local config', async () => {
        const opts = getBaseCommandOpts(sandbox, {}, [[flags.namespace, 'deployment-4']]);

        command = await runSelectContextTask(opts); // @ts-ignore
        expect(command.getK8().getKubeConfig().setCurrentContext).to.have.been.calledWith('context-3');
      });

      it('should use clusters and contexts from kubeConfig if selected deployment is not found in local config and quiet=true', async () => {
        const opts = getBaseCommandOpts(sandbox, {}, [
          [flags.namespace, 'deployment-4'],
          [flags.quiet, true],
        ]);

        command = await runSelectContextTask(opts); // @ts-ignore
        expect(command.getK8().getKubeConfig().setCurrentContext).to.have.been.calledWith('context-from-kubeConfig');
      });
    });
  });
});
