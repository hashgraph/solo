/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {describe, it} from 'mocha';
import {expect} from 'chai';

import {InitCommand} from '../../../../src/commands/init.js';
import {type DependencyManager} from '../../../../src/core/dependency_managers/index.js';
import {type Helm} from '../../../../src/core/helm.js';
import {type ChartManager} from '../../../../src/core/chart_manager.js';
import {type ConfigManager} from '../../../../src/core/config_manager.js';
import {type K8Factory} from '../../../../src/core/kube/k8_factory.js';
import {K8Client} from '../../../../src/core/kube/k8_client/k8_client.js';
import {LocalConfig} from '../../../../src/core/config/local_config.js';
import {type KeyManager} from '../../../../src/core/key_manager.js';
import {type LeaseManager} from '../../../../src/core/lease/lease_manager.js';
import {type RemoteConfigManager} from '../../../../src/core/config/remote/remote_config_manager.js';
import * as logging from '../../../../src/core/logging.js';
import sinon from 'sinon';
import path from 'path';
import {BASE_TEST_DIR} from '../../../test_util.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../src/core/dependency_injection/inject_tokens.js';

const testLogger = logging.NewLogger('debug', true);
describe('InitCommand', () => {
  const depManager: DependencyManager = container.resolve(InjectTokens.DependencyManager);
  const helm: Helm = container.resolve(InjectTokens.Helm);
  const chartManager: ChartManager = container.resolve(InjectTokens.ChartManager);

  const configManager: ConfigManager = container.resolve(InjectTokens.ConfigManager);
  let k8Factory: K8Factory;
  let localConfig: LocalConfig;

  const keyManager: KeyManager = container.resolve(InjectTokens.KeyManager);

  let leaseManager: LeaseManager;
  let remoteConfigManager: RemoteConfigManager;

  let sandbox = sinon.createSandbox();
  let initCmd: InitCommand;

  before(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(K8Client.prototype, 'init').callsFake(() => this);
    k8Factory = container.resolve(InjectTokens.K8Factory);
    localConfig = new LocalConfig(path.join(BASE_TEST_DIR, 'local-config.yaml'));
    remoteConfigManager = container.resolve(InjectTokens.RemoteConfigManager);
    leaseManager = container.resolve(InjectTokens.LeaseManager);

    // @ts-ignore
    initCmd = new InitCommand({
      logger: testLogger,
      helm,
      k8Factory,
      chartManager,
      configManager,
      depManager,
      keyManager,
      leaseManager,
      localConfig,
      remoteConfigManager,
    });
  });

  after(() => {
    sandbox.restore();
  });

  describe('commands', () => {
    it('init execution should succeed', async () => {
      await expect(initCmd.init({})).to.eventually.equal(true);
    }).timeout(Duration.ofSeconds(60).toMillis());
  });

  describe('methods', () => {
    it('command definition should return a valid command def', () => {
      const def = initCmd.getCommandDefinition();

      // @ts-ignore
      expect(def.name).not.to.be.null;
      expect(def.desc).not.to.be.null;
      expect(def.handler).not.to.be.null;
    });
  });
});
