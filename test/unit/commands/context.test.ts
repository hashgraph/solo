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

import {ContextCommandTasks} from '../../../src/commands/context/tasks.js';
import {
  AccountManager,
  CertificateManager,
  ChartManager,
  ConfigManager,
  DependencyManager,
  Helm,
  K8,
  KeyManager,
  LeaseManager,
  LocalConfig,
  PackageDownloader,
  PlatformInstaller,
  ProfileManager,
  RemoteConfigManager,
} from '../../../src/core/index.js';
import {getTestCacheDir, testLocalConfigData} from '../../test_util.js';
import {BaseCommand} from '../../../src/commands/base.js';
import {flags} from '../../../src/commands/index.js';
import {SoloLogger} from '../../../src/core/logging.js';
import {type Opts} from '../../../src/types/index.js';
import fs from 'fs';
import {stringify} from 'yaml';
import {type Cluster, KubeConfig} from '@kubernetes/client-node';
import {ListrTaskWrapper} from 'listr2';

describe('ContextCommandTasks unit tests', () => {
  const filePath = `${getTestCacheDir('ContextCommandTasks')}/localConfig.yaml`;

  const getBaseCommandOpts = (sandbox: sinon.SinonSandbox) => {
    const loggerStub = sandbox.createStubInstance(SoloLogger);
    const k8Stub = sandbox.createStubInstance(K8);
    k8Stub.getContexts.returns([
      {cluster: 'cluster-1', user: 'user-1', name: 'context-1', namespace: 'deployment-1'},
      {cluster: 'cluster-2', user: 'user-2', name: 'context-2', namespace: 'deployment-2'},
      {cluster: 'cluster-3', user: 'user-3', name: 'context-3', namespace: 'deployment-3'},
    ]);
    const kubeConfigStub = sandbox.createStubInstance(KubeConfig);
    kubeConfigStub.getCurrentContext.returns('context-3');
    kubeConfigStub.getCurrentContext.returns('context-3');
    kubeConfigStub.getCurrentCluster.returns({
      name: 'cluster-3',
      caData: 'caData',
      caFile: 'caFile',
      server: 'server-3',
      skipTLSVerify: true,
      tlsServerName: 'tls-3',
    } as Cluster);

    k8Stub.getKubeConfig.returns(kubeConfigStub);

    const configManager = sandbox.createStubInstance(ConfigManager);

    return {
      logger: loggerStub,
      helm: sandbox.createStubInstance(Helm),
      k8: k8Stub,
      chartManager: sandbox.createStubInstance(ChartManager),
      configManager,
      depManager: sandbox.createStubInstance(DependencyManager),
      localConfig: new LocalConfig(filePath, loggerStub, configManager),
      downloader: sandbox.createStubInstance(PackageDownloader),
      keyManager: sandbox.createStubInstance(KeyManager),
      accountManager: sandbox.createStubInstance(AccountManager),
      platformInstaller: sandbox.createStubInstance(PlatformInstaller),
      profileManager: sandbox.createStubInstance(ProfileManager),
      leaseManager: sandbox.createStubInstance(LeaseManager),
      certificateManager: sandbox.createStubInstance(CertificateManager),
      remoteConfigManager: sandbox.createStubInstance(RemoteConfigManager),
    } as Opts;
  };

  describe('updateLocalConfig', () => {
    const sandbox = sinon.createSandbox();
    let namespacePromptStub: sinon.SinonStub;
    let clusterNamePromptStub: sinon.SinonStub;
    let contextPromptStub: sinon.SinonStub;
    let tasks: ContextCommandTasks;
    let loggerStub: sinon.SinonStubbedInstance<SoloLogger>;
    let localConfig: LocalConfig;

    async function runUpdateLocalConfigTask(argv) {
      const taskObj = tasks.updateLocalConfig(argv);
      return taskObj.task({}, sandbox.stub() as unknown as ListrTaskWrapper<any, any, any>);
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
      promptMap = getPromptMap();
      await fs.promises.writeFile(filePath, stringify(testLocalConfigData));
      // command = new BaseCommand(getBaseCommandOpts(sandbox));
      tasks = new ContextCommandTasks(promptMap);
    });

    it('should update local configuration with provided values', async () => {
      const argv = {
        [flags.namespace.name]: 'deployment-2',
        [flags.clusterName.name]: 'cluster-2',
        [flags.context.name]: 'context-2',
      };

      await runUpdateLocalConfigTask(argv); // @ts-ignore
      localConfig = new LocalConfig(filePath, loggerStub, command.configManager);

      expect(localConfig.currentDeploymentName).to.equal('deployment-2');
      expect(localConfig.getCurrentDeployment().clusters).to.deep.equal(['cluster-2']);
      expect(tasks.getK8().getKubeConfig().setCurrentContext).to.have.been.calledWith('context-2');
    });

    it('should prompt for all flags if none are provided', async () => {
      const argv = {};
      await runUpdateLocalConfigTask(argv); //@ts-ignore
      localConfig = new LocalConfig(filePath, loggerStub, command.configManager);

      expect(localConfig.currentDeploymentName).to.equal('deployment-3');
      expect(localConfig.getCurrentDeployment().clusters).to.deep.equal(['cluster-3']);
      expect(tasks.getK8().getKubeConfig().setCurrentContext).to.have.been.calledWith('context-3');
      expect(namespacePromptStub).to.have.been.calledOnce;
      expect(clusterNamePromptStub).to.have.been.calledOnce;
      expect(contextPromptStub).to.have.been.calledOnce;
    });

    it('should prompt for namespace if no value is provided', async () => {
      const argv = {
        [flags.clusterName.name]: 'cluster-2',
        [flags.context.name]: 'context-2',
      };

      await runUpdateLocalConfigTask(argv); // @ts-ignore
      localConfig = new LocalConfig(filePath, loggerStub, command.configManager);

      expect(localConfig.currentDeploymentName).to.equal('deployment-3');
      expect(localConfig.getCurrentDeployment().clusters).to.deep.equal(['cluster-2']);
      expect(tasks.getK8().getKubeConfig().setCurrentContext).to.have.been.calledWith('context-2');
      expect(namespacePromptStub).to.have.been.calledOnce;
      expect(clusterNamePromptStub).to.have.been.not.called;
      expect(contextPromptStub).to.have.been.not.called;
    });

    it('should prompt for cluster if no value is provided', async () => {
      const argv = {
        [flags.namespace.name]: 'deployment-2',
        [flags.context.name]: 'context-2',
      };

      await runUpdateLocalConfigTask(argv); // @ts-ignore
      localConfig = new LocalConfig(filePath, loggerStub, command.configManager);

      expect(localConfig.currentDeploymentName).to.equal('deployment-2');
      expect(localConfig.getCurrentDeployment().clusters).to.deep.equal(['cluster-3']);
      expect(tasks.getK8().getKubeConfig().setCurrentContext).to.have.been.calledWith('context-2');
      expect(namespacePromptStub).to.have.been.not.called;
      expect(clusterNamePromptStub).to.have.been.calledOnce;
      expect(contextPromptStub).to.have.been.not.called;
    });

    it('should prompt for context if no value is provided', async () => {
      const argv = {
        [flags.namespace.name]: 'deployment-2',
        [flags.clusterName.name]: 'cluster-2',
      };

      await runUpdateLocalConfigTask(argv); // @ts-ignore
      localConfig = new LocalConfig(filePath, loggerStub, command.configManager);

      expect(localConfig.currentDeploymentName).to.equal('deployment-2');
      expect(localConfig.getCurrentDeployment().clusters).to.deep.equal(['cluster-2']);
      expect(tasks.getK8().getKubeConfig().setCurrentContext).to.have.been.calledWith('context-3');
      expect(namespacePromptStub).to.have.been.not.called;
      expect(clusterNamePromptStub).to.have.been.not.called;
      expect(contextPromptStub).to.have.been.calledOnce;
    });

    it('should use cluster from kubectl if no value is provided and quiet=true', async () => {
      const argv = {
        [flags.namespace.name]: 'deployment-2',
        [flags.context.name]: 'context-2',
        [flags.quiet.name]: 'true',
      };

      await runUpdateLocalConfigTask(argv); // @ts-ignore
      localConfig = new LocalConfig(filePath, loggerStub, command.configManager);

      expect(localConfig.currentDeploymentName).to.equal('deployment-2');
      expect(localConfig.getCurrentDeployment().clusters).to.deep.equal(['cluster-3']);
      expect(tasks.getK8().getKubeConfig().setCurrentContext).to.have.been.calledWith('context-2');
      expect(namespacePromptStub).to.have.been.not.called;
      expect(clusterNamePromptStub).to.have.been.not.called;
      expect(contextPromptStub).to.have.been.not.called;
    });

    it('should use namespace from kubectl if no value is provided and quiet=true', async () => {
      const argv = {
        [flags.clusterName.name]: 'cluster-2',
        [flags.context.name]: 'context-2',
        [flags.quiet.name]: 'true',
      };

      await runUpdateLocalConfigTask(argv); // @ts-ignore
      localConfig = new LocalConfig(filePath, loggerStub, command.configManager);

      expect(localConfig.currentDeploymentName).to.equal('deployment-2');
      expect(localConfig.getCurrentDeployment().clusters).to.deep.equal(['cluster-2']);
      expect(tasks.getK8().getKubeConfig().setCurrentContext).to.have.been.calledWith('context-2');
      expect(namespacePromptStub).to.have.been.not.called;
      expect(clusterNamePromptStub).to.have.been.not.called;
      expect(contextPromptStub).to.have.been.not.called;
    });
  });
});
