// SPDX-License-Identifier: Apache-2.0

import {it, describe, after, before} from 'mocha';
import {expect} from 'chai';

import * as constants from '../../../../src/core/constants.js';
import * as fs from 'node:fs';

import {endToEndTestSuite, getTestCacheDirectory, getTestCluster, getTestLogger} from '../../../test-utility.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import * as version from '../../../../version.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {type AccountManager} from '../../../../src/core/account-manager.js';
import {type PlatformInstaller} from '../../../../src/core/platform-installer.js';
import {NamespaceName} from '../../../../src/integration/kube/resources/namespace/namespace-name.js';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {ContainerReference} from '../../../../src/integration/kube/resources/container/container-reference.js';
import {Argv} from '../../../helpers/argv-wrapper.js';

const defaultTimeout = Duration.ofSeconds(20).toMillis();

const namespace = NamespaceName.of('pkg-installer-e2e');
const argv = Argv.getDefaultArgv(namespace);
const testCacheDirectory = getTestCacheDirectory();
argv.setArg(flags.cacheDir, testCacheDirectory);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.nodeAliasesUnparsed, 'node1');
argv.setArg(flags.clusterRef, getTestCluster());
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);

endToEndTestSuite(namespace.name, argv, {startNodes: false}, bootstrapResp => {
  describe('Platform Installer E2E', async () => {
    let k8Factory: K8Factory;
    let accountManager: AccountManager;
    let installer: PlatformInstaller;
    const podName = PodName.of('network-node1-0');
    const podReference = PodReference.of(namespace, podName);
    const packageVersion = 'v0.42.5';

    before(() => {
      k8Factory = bootstrapResp.opts.k8Factory;
      accountManager = bootstrapResp.opts.accountManager;
      installer = bootstrapResp.opts.platformInstaller;
    });

    after(async function () {
      this.timeout(Duration.ofMinutes(3).toMillis());

      await k8Factory.default().namespaces().delete(namespace);
      await accountManager.close();
    });

    before(function () {
      this.timeout(defaultTimeout);

      if (!fs.existsSync(testCacheDirectory)) {
        fs.mkdirSync(testCacheDirectory);
      }
    });

    describe('fetchPlatform', () => {
      it('should fail with invalid pod', async () => {
        try {
          // @ts-ignore
          await installer.fetchPlatform(null, packageVersion);
          throw new Error(); // fail-safe, should not reach here
        } catch (error) {
          expect(error.message).to.include('podReference is required');
        }

        try {
          // @ts-ignore
          await installer.fetchPlatform(
            PodReference.of(NamespaceName.of('valid-namespace'), PodName.of('INVALID_POD')),
            packageVersion,
          );
          throw new Error(); // fail-safe, should not reach here
        } catch (error) {
          expect(error.message).to.include('must be a valid RFC-1123 DNS label');
        }
      }).timeout(defaultTimeout);

      it('should fail with invalid tag', async () => {
        try {
          await installer.fetchPlatform(podReference, 'INVALID');
          throw new Error(); // fail-safe, should not reach here
        } catch (error) {
          expect(error.message).to.include('curl: (22) The requested URL returned error: 404');
        }
      }).timeout(defaultTimeout);

      it('should succeed with valid tag and pod', async () => {
        expect(await installer.fetchPlatform(podReference, packageVersion)).to.be.true;
        const outputs = await k8Factory
          .default()
          .containers()
          .readByRef(ContainerReference.of(podReference, constants.ROOT_CONTAINER))
          .execContainer(`ls -la ${constants.HEDERA_HAPI_PATH}`);
        getTestLogger().showUser(outputs);
      }).timeout(Duration.ofMinutes(1).toMillis());
    });
  });
});
