/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {it, describe, after} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../../src/commands/flags.js';
import {e2eTestSuite, TEST_CLUSTER} from '../../../test_util.js';
import * as version from '../../../../version.js';
import {PodName} from '../../../../src/core/kube/resources/pod/pod_name.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {type K8Factory} from '../../../../src/core/kube/k8_factory.js';
import {type AccountManager} from '../../../../src/core/account_manager.js';
import {NamespaceName} from '../../../../src/core/kube/resources/namespace/namespace_name.js';
import {PodRef} from '../../../../src/core/kube/resources/pod/pod_ref.js';
import {Argv} from '../../../helpers/argv_wrapper.js';

const namespace = NamespaceName.of('account-mngr-e2e');
const argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.deployment, `${namespace.name}-deployment`);
argv.setArg(flags.nodeAliasesUnparsed, 'node1');
argv.setArg(flags.clusterRef, TEST_CLUSTER);
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.chartDirectory, process.env.SOLO_CHARTS_DIR ?? undefined);

e2eTestSuite(namespace.name, argv, {}, bootstrapResp => {
  describe('AccountManager', async () => {
    let k8Factory: K8Factory;
    let accountManager: AccountManager;

    before(() => {
      k8Factory = bootstrapResp.opts.k8Factory;
      accountManager = bootstrapResp.opts.accountManager;
    });

    after(async function () {
      this.timeout(Duration.ofMinutes(3).toMillis());

      await k8Factory.default().namespaces().delete(namespace);
      await accountManager.close();
    });

    it('should be able to stop port forwards', async () => {
      await accountManager.close();
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
      accountManager._portForwards.push(
        await k8Factory.default().pods().readByRef(podRef).portForward(localPort, podPort),
      );

      // ports should be closed
      await accountManager.close();
      expect(
        // @ts-expect-error - TS2341: Property _portForwards is private and only accessible within class AccountManager
        accountManager._portForwards,
        'expect that the closed account manager should have no port forwards',
      ).to.have.lengthOf(0);
    });
  });
});
