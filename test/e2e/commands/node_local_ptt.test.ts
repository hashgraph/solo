/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {describe} from 'mocha';

import {Flags as flags} from '../../../src/commands/flags.js';
import {e2eTestSuite, getDefaultArgv, TEST_CLUSTER} from '../../test_util.js';
import {Duration} from '../../../src/core/time/duration.js';
import {type K8Factory} from '../../../src/core/kube/k8_factory.js';
import {LOCAL_HEDERA_PLATFORM_VERSION} from '../../../version.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace_name.js';
import {type NetworkNodes} from '../../../src/core/network_nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency_injection/inject_tokens.js';

const namespace = NamespaceName.of('local-ptt-app');
const argv = getDefaultArgv(namespace);
argv[flags.nodeAliasesUnparsed.name] = 'node1,node2,node3';
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
argv[flags.clusterRef.name] = TEST_CLUSTER;
// set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined;
argv[flags.quiet.name] = true;
console.log('Starting local build for Platform app');
argv[flags.localBuildPath.name] =
  '../hedera-services/platform-sdk/sdk/data,node1=../hedera-services/platform-sdk/sdk/data,node2=../hedera-services/platform-sdk/sdk/data';
argv[flags.app.name] = 'PlatformTestingTool.jar';
argv[flags.appConfig.name] =
  '../hedera-services/platform-sdk/platform-apps/tests/PlatformTestingTool/src/main/resources/FCMFCQ-Basic-2.5k-5m.json';
argv[flags.namespace.name] = namespace.name;
argv[flags.releaseTag.name] = LOCAL_HEDERA_PLATFORM_VERSION;

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
    describe('Node for platform app should start successfully', () => {
      let k8Factory: K8Factory;

      before(() => {
        k8Factory = bootstrapResp.opts.k8Factory;
      });

      it('get the logs and delete the namespace', async () => {
        await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
        await k8Factory.default().namespaces().delete(namespace);
      }).timeout(Duration.ofMinutes(2).toMillis());
    });
  },
);
