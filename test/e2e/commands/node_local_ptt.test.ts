/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {describe} from 'mocha';

import {Flags as flags} from '../../../src/commands/flags.js';
import {e2eTestSuite, getDefaultArgv, TEST_CLUSTER} from '../../test_util.js';
import {Duration} from '../../../src/core/time/duration.js';
import {type K8} from '../../../src/core/kube/k8.js';
import {LOCAL_HEDERA_PLATFORM_VERSION} from '../../../version.js';
import {NamespaceName} from '../../../src/core/kube/namespace_name.js';

const LOCAL_PTT = NamespaceName.of('local-ptt-app');
const argv = getDefaultArgv();
argv[flags.nodeAliasesUnparsed.name] = 'node1,node2,node3';
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
argv[flags.clusterName.name] = TEST_CLUSTER;
// set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined;
argv[flags.quiet.name] = true;
console.log('Starting local build for Platform app');
argv[flags.localBuildPath.name] =
  '../hedera-services/platform-sdk/sdk/data,node1=../hedera-services/platform-sdk/sdk/data,node2=../hedera-services/platform-sdk/sdk/data';
argv[flags.app.name] = 'PlatformTestingTool.jar';
argv[flags.appConfig.name] =
  '../hedera-services/platform-sdk/platform-apps/tests/PlatformTestingTool/src/main/resources/FCMFCQ-Basic-2.5k-5m.json';
argv[flags.namespace.name] = LOCAL_PTT.name;
argv[flags.releaseTag.name] = LOCAL_HEDERA_PLATFORM_VERSION;

e2eTestSuite(
  LOCAL_PTT.name,
  argv,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  true,
  bootstrapResp => {
    describe('Node for platform app should start successfully', () => {
      let pttK8: K8;

      before(() => {
        pttK8 = bootstrapResp.opts.k8;
      });

      it('get the logs and delete the namespace', async () => {
        await pttK8.getNodeLogs(LOCAL_PTT);
        await pttK8.deleteNamespace(LOCAL_PTT);
      }).timeout(Duration.ofMinutes(2).toMillis());
    });
  },
);
