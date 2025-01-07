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
import {describe, it} from 'mocha';
import {expect} from 'chai';

import {InitCommand} from '../../../../src/commands/init.js';
import {DependencyManager} from '../../../../src/core/dependency_managers/index.js';
import {Helm} from '../../../../src/core/helm.js';
import {ChartManager} from '../../../../src/core/chart_manager.js';
import {ConfigManager} from '../../../../src/core/config_manager.js';
import {K8} from '../../../../src/core/k8.js';
import {LocalConfig} from '../../../../src/core/config/local_config.js';
import {KeyManager} from '../../../../src/core/key_manager.js';
import {LeaseManager} from '../../../../src/core/lease/lease_manager.js';
import {RemoteConfigManager} from '../../../../src/core/config/remote/remote_config_manager.js';
import * as logging from '../../../../src/core/logging.js';
import sinon from 'sinon';
import path from 'path';
import {BASE_TEST_DIR} from '../../../test_util.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';

const testLogger = logging.NewLogger('debug', true);
describe('InitCommand', () => {
  const depManager = container.resolve(DependencyManager);
  const helm = container.resolve(Helm);
  const chartManager = container.resolve(ChartManager);

  const configManager = container.resolve(ConfigManager);
  let k8: K8;
  let localConfig: LocalConfig;

  const keyManager = container.resolve(KeyManager);

  let leaseManager: LeaseManager;
  let remoteConfigManager: RemoteConfigManager;

  let sandbox = sinon.createSandbox();
  let initCmd: InitCommand;

  before(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(K8.prototype, 'init').callsFake(() => this);
    k8 = container.resolve(K8);
    localConfig = new LocalConfig(path.join(BASE_TEST_DIR, 'local-config.yaml'));
    remoteConfigManager = container.resolve(RemoteConfigManager);
    leaseManager = container.resolve(LeaseManager);

    // @ts-ignore
    initCmd = new InitCommand({
      logger: testLogger,
      helm,
      k8,
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
