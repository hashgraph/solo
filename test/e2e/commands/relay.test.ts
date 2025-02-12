/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {after, afterEach, describe} from 'mocha';
import {expect} from 'chai';
import each from 'mocha-each';

import {Flags as flags} from '../../../src/commands/flags.js';
import {e2eTestSuite, getDefaultArgv, HEDERA_PLATFORM_VERSION_TAG, TEST_CLUSTER} from '../../test_util.js';
import * as version from '../../../version.js';
import {sleep} from '../../../src/core/helpers.js';
import {RelayCommand} from '../../../src/commands/relay.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace_name.js';
import {type NetworkNodes} from '../../../src/core/network_nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency_injection/inject_tokens.js';

const testName = 'relay-cmd-e2e';
const namespace = NamespaceName.of(testName);
const argv = getDefaultArgv();
argv[flags.namespace.name] = namespace.name;
argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG;
argv[flags.nodeAliasesUnparsed.name] = 'node1,node2';
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
argv[flags.clusterRef.name] = TEST_CLUSTER;
argv[flags.soloChartVersion.name] = version.SOLO_CHART_VERSION;
argv[flags.force.name] = true;
argv[flags.relayReleaseTag.name] = flags.relayReleaseTag.definition.defaultValue;
argv[flags.quiet.name] = true;

e2eTestSuite(testName, argv, undefined, undefined, undefined, undefined, undefined, undefined, true, bootstrapResp => {
  describe('RelayCommand', async () => {
    const k8Factory = bootstrapResp.opts.k8Factory;
    const configManager = bootstrapResp.opts.configManager;
    const relayCmd = new RelayCommand(bootstrapResp.opts);

    after(async () => {
      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await k8Factory.default().namespaces().delete(namespace);
    });

    afterEach(async () => await sleep(Duration.ofMillis(5)));

    each(['node1', 'node1,node2']).it('relay deploy and destroy should work with $value', async function (relayNodes) {
      this.timeout(Duration.ofMinutes(5).toMillis());

      argv[flags.nodeAliasesUnparsed.name] = relayNodes;
      configManager.update(argv);

      // test relay deploy
      try {
        expect(await relayCmd.deploy(argv)).to.be.true;
      } catch (e) {
        relayCmd.logger.showUserError(e);
        expect.fail();
      }
      expect(relayCmd.getUnusedConfigs(RelayCommand.DEPLOY_CONFIGS_NAME)).to.deep.equal([
        flags.deployment.constName,
        flags.profileFile.constName,
        flags.profileName.constName,
        flags.quiet.constName,
      ]);
      await sleep(Duration.ofMillis(500));

      // test relay destroy
      try {
        expect(await relayCmd.destroy(argv)).to.be.true;
      } catch (e) {
        relayCmd.logger.showUserError(e);
        expect.fail();
      }
    });
  });
});
