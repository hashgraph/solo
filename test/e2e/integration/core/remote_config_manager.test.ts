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
import {it, describe, after, before} from 'mocha';
import {expect} from 'chai';

import * as fs from 'fs';
import * as constants from '../../../../src/core/constants.js';
import {LocalConfig} from '../../../../src/core/config/local_config.js';
import {RemoteConfigManager} from '../../../../src/core/config/remote/remote_config_manager.js';
import {e2eTestSuite, getDefaultArgv, getTestCacheDir, TEST_CLUSTER} from '../../../test_util.js';
import {flags} from '../../../../src/commands/index.js';
import * as version from '../../../../version.js';
import {MINUTES, SECONDS} from '../../../../src/core/constants.js';
import path from 'path';
import {SoloError} from '../../../../src/core/errors.js';
import {RemoteConfigDataWrapper} from '../../../../src/core/config/remote/remote_config_data_wrapper.js';

const defaultTimeout = 20 * SECONDS;

const namespace = 'remote-config-manager-e2e';
const argv = getDefaultArgv();
const testCacheDir = getTestCacheDir();
argv[flags.cacheDir.name] = testCacheDir;
argv[flags.namespace.name] = namespace;
argv[flags.nodeAliasesUnparsed.name] = 'node1';
argv[flags.clusterName.name] = TEST_CLUSTER;
argv[flags.soloChartVersion.name] = version.SOLO_CHART_VERSION;
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
// set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined;

e2eTestSuite(
  namespace,
  argv,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  false,
  bootstrapResp => {
    describe('RemoteConfigManager', async () => {
      const k8 = bootstrapResp.opts.k8;
      const logger = bootstrapResp.opts.logger;
      const configManager = bootstrapResp.opts.configManager;
      const filePath = path.join(constants.SOLO_CACHE_DIR, constants.DEFAULT_LOCAL_CONFIG_FILE);

      const localConfig = new LocalConfig(filePath, logger, configManager);
      const remoteConfigManager = new RemoteConfigManager(k8, logger, localConfig, configManager);

      const email = 'john@gmail.com';

      localConfig.userEmailAddress = email;
      localConfig.deployments = {[namespace]: {clusters: [`kind-${namespace}`]}};
      localConfig.currentDeploymentName = namespace;

      after(async function () {
        this.timeout(3 * MINUTES);
        await k8.deleteNamespace(namespace);
      });

      before(function () {
        this.timeout(defaultTimeout);

        if (!fs.existsSync(testCacheDir)) {
          fs.mkdirSync(testCacheDir);
        }
      });

      it('Attempting to load and save without existing remote config should fail', async () => {
        // @ts-ignore
        expect(await remoteConfigManager.load()).to.equal(false);

        // @ts-ignore
        await expect(remoteConfigManager.save()).to.be.rejectedWith(
          SoloError,
          'Attempted to save remote config without data',
        );
      });

      it('isLoaded() should return false if config is not loaded', async () => {
        expect(remoteConfigManager.isLoaded()).to.not.be.ok;
      });

      it('isLoaded() should return true if config is loaded', async () => {
        // @ts-ignore
        await remoteConfigManager.create();

        expect(remoteConfigManager.isLoaded()).to.be.ok;
      });

      it('should be able to use create method to populate the configMap', async () => {
        // @ts-ignore
        const remoteConfigData = remoteConfigManager.remoteConfig;

        expect(remoteConfigData).to.be.ok;
        expect(remoteConfigData).to.be.instanceOf(RemoteConfigDataWrapper);

        expect(remoteConfigData.metadata.lastUpdatedAt).to.be.instanceOf(Date);
        expect(remoteConfigData.metadata.lastUpdateBy).to.equal(email);
        expect(remoteConfigData.metadata.migration).not.to.be.ok;

        expect(remoteConfigData.lastExecutedCommand).to.equal('deployment create');
        expect(remoteConfigData.commandHistory).to.deep.equal(['deployment create']);

        // @ts-ignore
        expect(await remoteConfigManager.load()).to.equal(true);

        // @ts-ignore
        expect(remoteConfigData.toObject()).to.deep.equal(remoteConfigManager.remoteConfig.toObject());
      });

      it('should be able to mutate remote config with the modify method', async () => {
        // @ts-ignore
        const remoteConfigData = remoteConfigManager.remoteConfig;

        const oldRemoteConfig = remoteConfigData.components.clone();

        await remoteConfigManager.modify(async remoteConfig => {
          remoteConfig.metadata.makeMigration('email@address.com', '1.0.0');
        });

        // @ts-ignore
        expect(oldRemoteConfig.toObject()).not.to.deep.equal(remoteConfigManager.remoteConfig.toObject());

        // @ts-ignore
        const updatedRemoteConfig = remoteConfigManager.remoteConfig;

        // @ts-ignore
        await remoteConfigManager.load();

        // @ts-ignore
        expect(remoteConfigManager.remoteConfig.toObject()).to.deep.equal(updatedRemoteConfig.toObject());
      });
    });
  },
);
