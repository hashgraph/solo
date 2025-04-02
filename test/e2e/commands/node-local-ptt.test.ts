// SPDX-License-Identifier: Apache-2.0

import {describe} from 'mocha';

import {Flags as flags} from '../../../src/commands/flags.js';
import {endToEndTestSuite, getTestCluster} from '../../test-utility.js';
import {Duration} from '../../../src/core/time/duration.js';
import {TEST_LOCAL_HEDERA_PLATFORM_VERSION} from '../../../version-test.js';
import {NamespaceName} from '../../../src/integration/kube/resources/namespace/namespace-name.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';

const namespace = NamespaceName.of('local-ptt-app');
const argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2,node3');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, getTestCluster());

console.log('Starting local build for Platform app');
argv.setArg(
  flags.localBuildPath,
  '../hiero-consensus-node/platform-sdk/sdk/data,node1=../hiero-consensus-node/platform-sdk/sdk/data,node2=../hiero-consensus-node/platform-sdk/sdk/data',
);
argv.setArg(
  flags.appConfig,
  '../hiero-consensus-node/platform-sdk/platform-apps/tests/PlatformTestingTool/src/main/resources/FCMFCQ-Basic-2.5k-5m.json',
);

argv.setArg(flags.app, 'PlatformTestingTool.jar');
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.releaseTag, TEST_LOCAL_HEDERA_PLATFORM_VERSION);

endToEndTestSuite(namespace.name, argv, {}, bootstrapResp => {
  describe('Node for platform app should start successfully', () => {
    const {
      opts: {k8Factory},
    } = bootstrapResp;

    it('get the logs and delete the namespace', async () => {
      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await k8Factory.default().namespaces().delete(namespace);
    }).timeout(Duration.ofMinutes(2).toMillis());
  });
});
