/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {expect} from 'chai';

import {DependencyManager} from '../../../src/core/dependency_managers/index.js';
import {Helm} from '../../../src/core/helm.js';
import {ChartManager} from '../../../src/core/chart_manager.js';
import {ConfigManager} from '../../../src/core/config_manager.js';
import {LocalConfig} from '../../../src/core/config/local_config.js';
import {RemoteConfigManager} from '../../../src/core/config/remote/remote_config_manager.js';
import {K8Client} from '../../../src/core/kube/k8_client/k8_client.js';
import {BaseCommand} from '../../../src/commands/base.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import sinon from 'sinon';
import {container} from 'tsyringe-neo';
import {SoloLogger} from '../../../src/core/logging.js';
import {resetForTest} from '../../test_container.js';

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
      testLogger = container.resolve(SoloLogger);
      helm = container.resolve(Helm);
      chartManager = container.resolve(ChartManager);
      configManager = container.resolve(ConfigManager);
      depManager = container.resolve(DependencyManager);
      localConfig = container.resolve(LocalConfig);
      remoteConfigManager = container.resolve(RemoteConfigManager);

      sandbox = sinon.createSandbox();
      sandbox.stub(K8Client.prototype, 'init').callsFake(() => this);
      const k8 = container.resolve('K8');

      // @ts-ignore
      baseCmd = new BaseCommand({
        logger: testLogger,
        helm,
        k8,
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
      const argv = {};
      argv[flags.releaseTag.name] = 'releaseTag1';
      argv[flags.tlsClusterIssuerType.name] = 'type2';
      argv[flags.valuesFile.name] = 'file3';
      configManager.update(argv);

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
      const newClassInstance1 = baseCmd.getConfig(NEW_CLASS1_NAME, flagsList, extraVars) as newClassInstance;
      expect(newClassInstance1.releaseTag).to.equal('releaseTag1');
      expect(newClassInstance1.tlsClusterIssuerType).to.equal('type2');
      expect(newClassInstance1.valuesFile).to.equal('file3');
      expect(newClassInstance1.var1).to.equal('');
      expect(newClassInstance1.var2).to.equal('');
      expect(baseCmd.getUnusedConfigs(NEW_CLASS1_NAME)).to.deep.equal([]);

      const NEW_CLASS2_NAME = 'newClassInstance2';
      const newClassInstance2 = baseCmd.getConfig(NEW_CLASS2_NAME, flagsList, extraVars) as newClassInstance;
      newClassInstance2.var1 = 'var1';
      newClassInstance2.var2 = 'var2';
      expect(newClassInstance2.var1).to.equal('var1');
      expect(newClassInstance2.var2).to.equal('var2');
      expect(baseCmd.getUnusedConfigs(NEW_CLASS2_NAME)).to.deep.equal([
        flags.releaseTag.constName,
        flags.tlsClusterIssuerType.constName,
        flags.valuesFile.constName,
      ]);

      const NEW_CLASS3_NAME = 'newClassInstance3';
      const newClassInstance3 = baseCmd.getConfig(NEW_CLASS3_NAME, flagsList, extraVars) as newClassInstance;
      newClassInstance3.var1 = 'var1';
      expect(newClassInstance3.var1).to.equal('var1');
      expect(newClassInstance3.tlsClusterIssuerType).to.equal('type2');
      expect(baseCmd.getUnusedConfigs(NEW_CLASS3_NAME)).to.deep.equal([
        flags.releaseTag.constName,
        flags.valuesFile.constName,
        'var2',
      ]);

      const newClassInstance4 = baseCmd.getConfig('newClassInstance4', []) as newClassInstance;
      expect(newClassInstance4.getUnusedConfigs()).to.deep.equal([]);
    });
  });
});
