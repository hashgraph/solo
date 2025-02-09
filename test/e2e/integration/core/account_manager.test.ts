/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {it, describe, after} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../../src/commands/flags.js';
import {e2eTestSuite, getDefaultArgv, TEST_CLUSTER} from '../../../test_util.js';
import * as version from '../../../../version.js';
import {PodName} from '../../../../src/core/kube/pod_name.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {type K8} from '../../../../src/core/kube/k8.js';
import {type AccountManager} from '../../../../src/core/account_manager.js';
import {NamespaceName} from '../../../../src/core/kube/resources/namespace/namespace_name.js';
import {PodRef} from '../../../../src/core/kube/pod_ref.js';

const namespace = NamespaceName.of('account-mngr-e2e');
const argv = getDefaultArgv();
argv[flags.namespace.name] = namespace.name;
argv[flags.deployment.name] = 'deployment';
argv[flags.nodeAliasesUnparsed.name] = 'node1';
argv[flags.clusterName.name] = TEST_CLUSTER;
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
  true,
  bootstrapResp => {
    describe('AccountManager', async () => {
      let k8: K8;
      let accountManager: AccountManager;

      before(() => {
        k8 = bootstrapResp.opts.k8;
        accountManager = bootstrapResp.opts.accountManager;
      });

      after(async function () {
        this.timeout(Duration.ofMinutes(3).toMillis());

        await k8.namespaces().delete(namespace);
        await accountManager.close();
      });

      it('should be able to stop port forwards', async () => {
        await accountManager.close();
        const localHost = '127.0.0.1';

        const podName = PodName.of('minio-console'); // use a svc that is less likely to be used by other tests
        const podRef: PodRef = PodRef.of(namespace, podName);
        const podPort = 9_090;
        const localPort = 19_090;

        expect(
          // @ts-expect-error - TS2341: Property _portForwards is private and only accessible within class AccountManager
          accountManager._portForwards,
          'starting accountManager port forwards lengths should be zero',
        ).to.have.lengthOf(0);

        // ports should be opened
        // @ts-expect-error - TS2341: Property _portForwards is private and only accessible within class AccountManager
        accountManager._portForwards.push(await k8.portForward(podRef, localPort, podPort));

        // ports should be closed
        await accountManager.close();
        expect(
          // @ts-expect-error - TS2341: Property _portForwards is private and only accessible within class AccountManager
          accountManager._portForwards,
          'expect that the closed account manager should have no port forwards',
        ).to.have.lengthOf(0);
      });
    });
  },
);
