/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {it, describe, after, before} from 'mocha';
import {expect} from 'chai';

import * as constants from '../../../../src/core/constants.js';
import * as fs from 'fs';

import {e2eTestSuite, getDefaultArgv, getTestCacheDir, TEST_CLUSTER, testLogger} from '../../../test_util.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import * as version from '../../../../version.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {type K8} from '../../../../src/core/kube/k8.js';
import {type AccountManager} from '../../../../src/core/account_manager.js';
import {type PlatformInstaller} from '../../../../src/core/platform_installer.js';

const defaultTimeout = Duration.ofSeconds(20).toMillis();

const namespace = 'pkg-installer-e2e';
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
    describe('Platform Installer E2E', async () => {
      let k8: K8;
      let accountManager: AccountManager;
      let installer: PlatformInstaller;
      const podName = 'network-node1-0';
      const packageVersion = 'v0.42.5';

      before(() => {
        k8 = bootstrapResp.opts.k8;
        accountManager = bootstrapResp.opts.accountManager;
        installer = bootstrapResp.opts.platformInstaller;
      });

      after(async function () {
        this.timeout(Duration.ofMinutes(3).toMillis());

        await k8.deleteNamespace(namespace);
        await accountManager.close();
      });

      before(function () {
        this.timeout(defaultTimeout);

        if (!fs.existsSync(testCacheDir)) {
          fs.mkdirSync(testCacheDir);
        }
      });

      describe('fetchPlatform', () => {
        it('should fail with invalid pod', async () => {
          try {
            // @ts-ignore
            await installer.fetchPlatform('', packageVersion);
            throw new Error(); // fail-safe, should not reach here
          } catch (e) {
            expect(e.message).to.include('podName is required');
          }

          try {
            // @ts-ignore
            await installer.fetchPlatform('INVALID', packageVersion);
            throw new Error(); // fail-safe, should not reach here
          } catch (e) {
            expect(e.message).to.include('failed to extract platform code in this pod');
          }
        }).timeout(defaultTimeout);

        it('should fail with invalid tag', async () => {
          try {
            await installer.fetchPlatform(podName, 'INVALID');
            throw new Error(); // fail-safe, should not reach here
          } catch (e) {
            expect(e.message).to.include('curl: (22) The requested URL returned error: 404');
          }
        }).timeout(defaultTimeout);

        it('should succeed with valid tag and pod', async () => {
          expect(await installer.fetchPlatform(podName, packageVersion)).to.be.true;
          const outputs = await k8.execContainer(
            podName,
            constants.ROOT_CONTAINER,
            `ls -la ${constants.HEDERA_HAPI_PATH}`,
          );
          testLogger.showUser(outputs);
        }).timeout(Duration.ofMinutes(1).toMillis());
      });
    });
  },
);
