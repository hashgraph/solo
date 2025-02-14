/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {it, describe, after, before} from 'mocha';
import {expect} from 'chai';

import * as fs from 'fs';
import {type LocalConfig} from '../../../../src/core/config/local_config.js';
import {type RemoteConfigManager} from '../../../../src/core/config/remote/remote_config_manager.js';
import {e2eTestSuite, getDefaultArgv, getTestCacheDir, TEST_CLUSTER} from '../../../test_util.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import * as version from '../../../../version.js';

import {SoloError} from '../../../../src/core/errors.js';
import {RemoteConfigDataWrapper} from '../../../../src/core/config/remote/remote_config_data_wrapper.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {type K8Factory} from '../../../../src/core/kube/k8_factory.js';
import {NamespaceName} from '../../../../src/core/kube/resources/namespace/namespace_name.js';
import {InjectTokens} from '../../../../src/core/dependency_injection/inject_tokens.js';

const defaultTimeout = Duration.ofSeconds(20).toMillis();

const namespace = NamespaceName.of('remote-config-manager-e2e');
const deploymentName = 'deployment';
const argv = getDefaultArgv(namespace);
const testCacheDir = getTestCacheDir();
argv[flags.cacheDir.name] = testCacheDir;
argv[flags.namespace.name] = namespace.name;
argv[flags.deployment.name] = `${namespace.name}-deployment`;
argv[flags.nodeAliasesUnparsed.name] = 'node1';
argv[flags.clusterRef.name] = TEST_CLUSTER;
argv[flags.soloChartVersion.name] = version.SOLO_CHART_VERSION;
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
// set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined;

e2eTestSuite(
  namespace.name,
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
      let k8Factory: K8Factory;

      let localConfig: LocalConfig;
      let remoteConfigManager: RemoteConfigManager;

      const email = 'john@gmail.com';

      after(async function () {
        this.timeout(Duration.ofMinutes(3).toMillis());
        await k8Factory.default().namespaces().delete(namespace);
      });

      before(function () {
        this.timeout(defaultTimeout);

        k8Factory = bootstrapResp.opts.k8Factory;
        localConfig = container.resolve(InjectTokens.LocalConfig);
        remoteConfigManager = container.resolve(InjectTokens.RemoteConfigManager);

        localConfig.userEmailAddress = email;
        localConfig.deployments = {[deploymentName]: {clusters: [`kind-${deploymentName}`], namespace: namespace.name}};

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
