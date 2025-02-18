/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {it, describe, after, before} from 'mocha';
import {expect} from 'chai';

import * as fs from 'fs';
import {type LocalConfig} from '../../../../src/core/config/local_config.js';
import {type RemoteConfigManager} from '../../../../src/core/config/remote/remote_config_manager.js';
import {e2eTestSuite, getTestCacheDir, TEST_CLUSTER} from '../../../test_util.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import * as version from '../../../../version.js';

import {SoloError} from '../../../../src/core/errors.js';
import {RemoteConfigDataWrapper} from '../../../../src/core/config/remote/remote_config_data_wrapper.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {type K8Factory} from '../../../../src/core/kube/k8_factory.js';
import {NamespaceName} from '../../../../src/core/kube/resources/namespace/namespace_name.js';
import {InjectTokens} from '../../../../src/core/dependency_injection/inject_tokens.js';
import {Argv} from '../../../helpers/argv_wrapper.js';

const defaultTimeout = Duration.ofSeconds(20).toMillis();

const namespace = NamespaceName.of('remote-config-manager-e2e');
const deploymentName = 'deployment';
const argv = Argv.getDefaultArgv(namespace);
const testCacheDir = getTestCacheDir();
argv.setArg(flags.cacheDir, testCacheDir);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.deployment, `${namespace.name}-deployment`);
argv.setArg(flags.nodeAliasesUnparsed, 'node1');
argv.setArg(flags.clusterRef, TEST_CLUSTER);
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.chartDirectory, process.env.SOLO_CHARTS_DIR ?? undefined);

e2eTestSuite(namespace.name, argv, {startNodes: false}, bootstrapResp => {
  describe('RemoteConfigManager', async () => {
    let k8Factory: K8Factory;

    let localConfig: LocalConfig;
    let remoteConfigManager: RemoteConfigManager;

    const email = 'joe@doe.com';

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

    // TODO - we now create a remote config in the e2e test suite, so this test is no longer valid
    xit('Attempting to load and save without existing remote config should fail', async () => {
      // @ts-ignore
      expect(await remoteConfigManager.load()).to.equal(false);

      // @ts-ignore
      await expect(remoteConfigManager.save()).to.be.rejectedWith(
        SoloError,
        'Attempted to save remote config without data',
      );
    });

    // TODO - we now create a remote config in the e2e test suite, so this test is no longer valid
    xit('isLoaded() should return false if config is not loaded', async () => {
      expect(remoteConfigManager.isLoaded()).to.not.be.ok;
    });

    // TODO - we now create a remote config in the e2e test suite, so this test is no longer valid
    xit('isLoaded() should return true if config is loaded', async () => {
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
});
