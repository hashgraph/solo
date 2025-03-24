// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';

import {type DependencyManager} from '../../../src/core/dependency-managers/index.js';
import {type Helm} from '../../../src/core/helm.js';
import {type ChartManager} from '../../../src/core/chart-manager.js';
import {type ConfigManager} from '../../../src/core/config-manager.js';
import {type LocalConfig} from '../../../src/core/config/local/local-config.js';
import {RemoteConfigManager} from '../../../src/core/config/remote/remote-config-manager.js';
import {K8Client} from '../../../src/integration/kube/k8-client/k8-client.js';
import {BaseCommand} from '../../../src/commands/base.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import sinon from 'sinon';
import {container} from 'tsyringe-neo';
import {type SoloLogger} from '../../../src/core/logging.js';
import {resetForTest} from '../../test-container.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {ComponentsDataWrapper} from '../../../src/core/config/remote/components-data-wrapper.js';
import {createComponentsDataWrapper} from '../core/config/remote/components-data-wrapper.test.js';
import {type ClusterRefs} from '../../../src/core/config/remote/types.js';
import {Cluster} from '../../../src/core/config/remote/cluster.js';
import {ConsensusNode} from '../../../src/core/model/consensus-node.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {type NodeAlias} from '../../../src/types/aliases.js';

describe('BaseCommand', () => {
  let helm: Helm;
  let chartManager: ChartManager;
  let configManager: ConfigManager;
  let depManager: DependencyManager;
  let localConfig: LocalConfig;
  let remoteConfigManager: RemoteConfigManager;
  let sandbox = sinon.createSandbox();
  let testLogger: SoloLogger;

  let baseCmd: BaseCommand;

  describe('runShell', () => {
    before(() => {
      resetForTest();
      testLogger = container.resolve(InjectTokens.SoloLogger);
      helm = container.resolve(InjectTokens.Helm);
      chartManager = container.resolve(InjectTokens.ChartManager);
      configManager = container.resolve(InjectTokens.ConfigManager);
      depManager = container.resolve(InjectTokens.DependencyManager);
      localConfig = container.resolve(InjectTokens.LocalConfig);
      remoteConfigManager = container.resolve(InjectTokens.RemoteConfigManager);

      sandbox = sinon.createSandbox();
      sandbox.stub(K8Client.prototype, 'init').callsFake(() => this);
      const k8Factory = container.resolve(InjectTokens.K8Factory);

      // @ts-ignore
      baseCmd = new BaseCommand({
        logger: testLogger,
        helm,
        k8Factory,
        chartManager,
        configManager,
        depManager,
        localConfig,
        remoteConfigManager,
      });
    });

    after(() => {
      sandbox.restore();
    });

    it('should fail during invalid program check', async () => {
      await expect(baseCmd.run('INVALID_PROGRAM')).to.be.rejected;
    });
    it('should succeed during valid program check', async () => {
      await expect(baseCmd.run('echo')).to.eventually.not.be.null;
    });
    it('getConfig tracks property usage', () => {
      const flagsList = [flags.releaseTag, flags.tlsClusterIssuerType, flags.valuesFile];
      const argv = Argv.initializeEmpty();
      argv.setArg(flags.releaseTag, 'releaseTag1');
      argv.setArg(flags.tlsClusterIssuerType, 'type2');
      argv.setArg(flags.valuesFile, 'file3');
      configManager.update(argv.build());

      const extraVars = ['var1', 'var2'];

      interface newClassInstance {
        releaseTag: string;
        tlsClusterIssuerType: string;
        valuesFile: string;
        var1: string;
        var2: string;
        getUnusedConfigs: () => string[];
      }

      const NEW_CLASS1_NAME = 'newClassInstance1';
      const newClassInstance1 = baseCmd.configManager.getConfig(
        NEW_CLASS1_NAME,
        flagsList,
        extraVars,
      ) as newClassInstance;
      expect(newClassInstance1.releaseTag).to.equal('releaseTag1');
      expect(newClassInstance1.tlsClusterIssuerType).to.equal('type2');
      expect(newClassInstance1.valuesFile).to.equal('file3');
      expect(newClassInstance1.var1).to.equal('');
      expect(newClassInstance1.var2).to.equal('');
      expect(baseCmd.configManager.getUnusedConfigs(NEW_CLASS1_NAME)).to.deep.equal([]);

      const NEW_CLASS2_NAME = 'newClassInstance2';
      const newClassInstance2 = baseCmd.configManager.getConfig(
        NEW_CLASS2_NAME,
        flagsList,
        extraVars,
      ) as newClassInstance;
      newClassInstance2.var1 = 'var1';
      newClassInstance2.var2 = 'var2';
      expect(newClassInstance2.var1).to.equal('var1');
      expect(newClassInstance2.var2).to.equal('var2');
      expect(baseCmd.configManager.getUnusedConfigs(NEW_CLASS2_NAME)).to.deep.equal([
        flags.releaseTag.constName,
        flags.tlsClusterIssuerType.constName,
        flags.valuesFile.constName,
      ]);

      const NEW_CLASS3_NAME = 'newClassInstance3';
      const newClassInstance3 = baseCmd.configManager.getConfig(
        NEW_CLASS3_NAME,
        flagsList,
        extraVars,
      ) as newClassInstance;
      newClassInstance3.var1 = 'var1';
      expect(newClassInstance3.var1).to.equal('var1');
      expect(newClassInstance3.tlsClusterIssuerType).to.equal('type2');
      expect(baseCmd.configManager.getUnusedConfigs(NEW_CLASS3_NAME)).to.deep.equal([
        flags.releaseTag.constName,
        flags.valuesFile.constName,
        'var2',
      ]);

      const newClassInstance4 = baseCmd.configManager.getConfig('newClassInstance4', []) as newClassInstance;
      expect(newClassInstance4.getUnusedConfigs()).to.deep.equal([]);
    });
  });

  describe('get consensus nodes', () => {
    before(() => {
      const testLogger = sinon.stub();
      const helm = sinon.stub();
      const chartManager = sinon.stub();
      const configManager = sinon.stub();
      const depManager = sinon.stub();
      const localConfig = sinon.stub() as unknown as LocalConfig;

      // @ts-expect-error - TS2540: to mock
      localConfig.clusterRefs = sandbox.stub().returns({cluster: 'context1', cluster2: 'context2'});
      const {
        wrapper: {componentsDataWrapper},
      } = createComponentsDataWrapper();

      const newComponentsDataWrapper = ComponentsDataWrapper.fromObject(componentsDataWrapper.toObject());
      const remoteConfigManager = sinon.createStubInstance(RemoteConfigManager);

      const mockConsensusNodes = [
        new ConsensusNode(
          'name' as NodeAlias,
          0,
          'namespace',
          'cluster',
          'context1',
          'dnsBaseDomain',
          'dnsConsensusNodePattern',
          'fullyQualifiedDomainName',
        ),
        new ConsensusNode(
          'node2',
          1,
          'namespace',
          'cluster2',
          'context2',
          'dnsBaseDomain',
          'dnsConsensusNodePattern',
          'fullyQualifiedDomainName',
        ),
      ];

      remoteConfigManager.getConsensusNodes.returns(mockConsensusNodes);
      remoteConfigManager.getContexts.returns(mockConsensusNodes.map(node => node.context));
      remoteConfigManager.getClusterRefs.returns({cluster: 'context1', cluster2: 'context2'});

      Object.defineProperty(remoteConfigManager, 'components', {
        get: () => newComponentsDataWrapper,
      });
      remoteConfigManager.isLoaded = sinon.stub<[], boolean>().returns(true);

      const clusters = {};
      const cluster = new Cluster('cluster', 'namespace', 'deployment', undefined, undefined);
      clusters[cluster.name] = cluster;
      const cluster2 = new Cluster('cluster2', 'namespace', 'deployment', undefined, undefined);
      clusters[cluster2.name] = cluster2;
      Object.defineProperty(remoteConfigManager, 'clusters', {
        get: () => clusters,
      });
      const k8Factory = sinon.stub();

      // @ts-expect-error - allow to create instance of abstract class
      baseCmd = new BaseCommand(
        testLogger,
        helm,
        k8Factory,
        chartManager,
        configManager,
        depManager,
        localConfig,
        remoteConfigManager,
      );
    });

    it('should return consensus nodes', () => {
      // @ts-expect-error - TS2445: to access private property
      const consensusNodes = baseCmd.remoteConfigManager.getConsensusNodes();
      expect(consensusNodes).to.be.an('array');
      expect(consensusNodes[0].context).to.equal('context1');
      expect(consensusNodes[1].context).to.equal('context2');
      expect(consensusNodes[0].name).to.equal('name');
      expect(consensusNodes[1].name).to.equal('node2');
      expect(consensusNodes[0].namespace).to.equal('namespace');
      expect(consensusNodes[1].namespace).to.equal('namespace');
      expect(consensusNodes[0].nodeId).to.equal(0);
      expect(consensusNodes[1].nodeId).to.equal(1);
      expect(consensusNodes[0].cluster).to.equal('cluster');
      expect(consensusNodes[1].cluster).to.equal('cluster2');
    });

    it('should return contexts', () => {
      // @ts-expect-error - TS2445: to access private property
      const contexts = baseCmd.remoteConfigManager.getContexts();
      expect(contexts).to.be.an('array');
      expect(contexts[0]).to.equal('context1');
      expect(contexts[1]).to.equal('context2');
    });

    it('should return clusters references', () => {
      const expectedClusterRefs = {cluster: 'context1', cluster2: 'context2'};
      // @ts-expect-error - TS2445: to access private property
      const clusterRefs: ClusterRefs = baseCmd.remoteConfigManager.getClusterRefs();
      Object.keys(clusterRefs).forEach(clusterRef => {
        expect(clusterRefs[clusterRef]).to.equal(expectedClusterRefs[clusterRef]);
      });
    });
  });
});
