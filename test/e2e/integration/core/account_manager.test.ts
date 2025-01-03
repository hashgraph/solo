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
import {it, describe, after} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../../src/commands/flags.js';
import {e2eTestSuite, getDefaultArgv, TEST_CLUSTER} from '../../../test_util.js';
import * as version from '../../../../version.js';
import type {PodName} from '../../../../src/types/aliases.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {type K8} from '../../../../src/core/k8.js';
import {type AccountManager} from '../../../../src/core/account_manager.js';

const namespace = 'account-mngr-e2e';
const argv = getDefaultArgv();
argv[flags.namespace.name] = namespace;
argv[flags.nodeAliasesUnparsed.name] = 'node1';
argv[flags.clusterName.name] = TEST_CLUSTER;
argv[flags.soloChartVersion.name] = version.SOLO_CHART_VERSION;
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
// set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined;

e2eTestSuite(namespace, argv, undefined, undefined, undefined, undefined, undefined, undefined, true, bootstrapResp => {
  describe('AccountManager', async () => {
    let k8: K8;
    let accountManager: AccountManager;

    before(() => {
      k8 = bootstrapResp.opts.k8;
      accountManager = bootstrapResp.opts.accountManager;
    });

    after(async function () {
      this.timeout(Duration.ofMinutes(3).toMillis());

      await k8.deleteNamespace(namespace);
      await accountManager.close();
    });

    it('should be able to stop port forwards', async () => {
      await accountManager.close();
      const localHost = '127.0.0.1';

      const podName = 'minio-console' as PodName; // use a svc that is less likely to be used by other tests
      const podPort = 9_090;
      const localPort = 19_090;

      expect(
        // @ts-expect-error - TS2341: Property _portForwards is private and only accessible within class AccountManager
        accountManager._portForwards,
        'starting accountManager port forwards lengths should be zero',
      ).to.have.lengthOf(0);

      // ports should be opened
      // @ts-expect-error - TS2341: Property _portForwards is private and only accessible within class AccountManager
      accountManager._portForwards.push(await k8.portForward(podName, localPort, podPort));
      const status = await k8.testSocketConnection(localHost, localPort);
      expect(status, 'test connection status should be true').to.be.ok;

      // ports should be closed
      await accountManager.close();
      try {
        await k8.testSocketConnection(localHost, localPort);
      } catch (e) {
        expect(e.message, 'expect failed test connection').to.include(
          `failed to connect to '${localHost}:${localPort}'`,
        );
      }
      expect(
        // @ts-expect-error - TS2341: Property _portForwards is private and only accessible within class AccountManager
        accountManager._portForwards,
        'expect that the closed account manager should have no port forwards',
      ).to.have.lengthOf(0);
    });
  });
});
