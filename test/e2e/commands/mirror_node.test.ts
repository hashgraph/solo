/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {it, describe, after, before, afterEach} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  e2eTestSuite,
  getDefaultArgv,
  HEDERA_PLATFORM_VERSION_TAG,
  TEST_CLUSTER,
} from '../../test_util.js';
import * as version from '../../../version.js';
import {sleep} from '../../../src/core/helpers.js';
import {MirrorNodeCommand} from '../../../src/commands/mirror_node.js';
import {Status, TopicCreateTransaction, TopicMessageSubmitTransaction} from '@hashgraph/sdk';
import * as http from 'http';
import {type PodName} from '../../../src/types/aliases.js';
import {PackageDownloader} from '../../../src/core/package_downloader.js';
import {Duration} from '../../../src/core/time/duration.js';
import {ExplorerCommand} from '../../../src/commands/explorer.js';
import {NamespaceName} from '../../../src/core/kube/namespace_name.js';

const testName = 'mirror-cmd-e2e';
const namespace = NamespaceName.of(testName);
const argv = getDefaultArgv();
argv[flags.namespace.name] = namespace.name;
argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG;

argv[flags.nodeAliasesUnparsed.name] = 'node1'; // use a single node to reduce resource during e2e tests
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
argv[flags.clusterName.name] = TEST_CLUSTER;
argv[flags.soloChartVersion.name] = version.SOLO_CHART_VERSION;
argv[flags.force.name] = true;
argv[flags.relayReleaseTag.name] = flags.relayReleaseTag.definition.defaultValue;
// set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined;
argv[flags.quiet.name] = true;
argv[flags.pinger.name] = true;

argv[flags.enableHederaExplorerTls.name] = true;
e2eTestSuite(testName, argv, undefined, undefined, undefined, undefined, undefined, undefined, true, bootstrapResp => {
  describe('MirrorNodeCommand', async () => {
    const k8 = bootstrapResp.opts.k8;
    const mirrorNodeCmd = new MirrorNodeCommand(bootstrapResp.opts);
    const explorerCommand = new ExplorerCommand(bootstrapResp.opts);
    const downloader = new PackageDownloader(mirrorNodeCmd.logger);
    const accountManager = bootstrapResp.opts.accountManager;

    const testMessage = 'Mirror node test message';
    let portForwarder = null;
    let newTopicId = null;

    before(() => {
      bootstrapResp.opts.logger.showUser(`------------------------- START: ${testName} ----------------------------`);
    });

    after(async function () {
      this.timeout(Duration.ofMinutes(3).toMillis());

      await k8.getNodeLogs(namespace);
      await k8.deleteNamespace(namespace);
      await accountManager.close();

      bootstrapResp.opts.logger.showUser(`------------------------- END: ${testName} ----------------------------`);
    });

    // give a few ticks so that connections can close
    afterEach(async () => await sleep(Duration.ofMillis(500)));

    balanceQueryShouldSucceed(accountManager, mirrorNodeCmd, namespace);

    it('mirror node and explorer deploy should success', async () => {
      try {
        expect(await mirrorNodeCmd.deploy(argv)).to.be.true;
        expect(await explorerCommand.deploy(argv)).to.be.true;
      } catch (e) {
        mirrorNodeCmd.logger.showUserError(e);
        expect.fail();
      }

      expect(mirrorNodeCmd.getUnusedConfigs(MirrorNodeCommand.DEPLOY_CONFIGS_NAME)).to.deep.equal([
        flags.chartDirectory.constName,
        flags.profileFile.constName,
        flags.profileName.constName,
        flags.quiet.constName,
        flags.storageSecrets.constName,
        flags.storageEndpoint.constName,
      ]);
      expect(explorerCommand.getUnusedConfigs(MirrorNodeCommand.DEPLOY_CONFIGS_NAME)).to.deep.equal([
        flags.hederaExplorerTlsHostName.constName,
        flags.profileFile.constName,
        flags.profileName.constName,
        flags.quiet.constName,
      ]);
    }).timeout(Duration.ofMinutes(10).toMillis());

    it('mirror node API should be running', async () => {
      await accountManager.loadNodeClient(namespace);
      try {
        // find hedera explorer pod
        const pods = await k8.getPodsByLabel(['app.kubernetes.io/component=hedera-explorer']);
        const explorerPod = pods[0];

        portForwarder = await k8.portForward(explorerPod.metadata.name as PodName, 8_080, 8_080);
        await sleep(Duration.ofSeconds(2));

        // check if mirror node api server is running
        const apiURL = 'http://127.0.0.1:8080/api/v1/transactions';
        expect(await downloader.urlExists(apiURL)).to.be.true;
        await sleep(Duration.ofSeconds(2));
      } catch (e) {
        mirrorNodeCmd.logger.showUserError(e);
        expect.fail();
      }
    }).timeout(Duration.ofMinutes(1).toMillis());

    it('Explorer GUI should be running', async () => {
      try {
        const guiURL = 'http://127.0.0.1:8080/localnet/dashboard';
        expect(await downloader.urlExists(guiURL)).to.be.true;
        await sleep(Duration.ofSeconds(2));

        mirrorNodeCmd.logger.debug('mirror node API and explorer GUI are running');
      } catch (e) {
        mirrorNodeCmd.logger.showUserError(e);
        expect.fail();
      }
    }).timeout(Duration.ofMinutes(1).toMillis());

    it('Create topic and submit message should success', async () => {
      try {
        // Create a new public topic and submit a message
        const txResponse = await new TopicCreateTransaction().execute(accountManager._nodeClient);
        const receipt = await txResponse.getReceipt(accountManager._nodeClient);
        newTopicId = receipt.topicId;
        mirrorNodeCmd.logger.debug(`Newly created topic ID is: ${newTopicId}`);

        const submitResponse = await new TopicMessageSubmitTransaction({
          topicId: newTopicId,
          message: testMessage,
        }).execute(accountManager._nodeClient);

        const submitReceipt = await submitResponse.getReceipt(accountManager._nodeClient);
        expect(submitReceipt.status).to.deep.equal(Status.Success);
      } catch (e) {
        mirrorNodeCmd.logger.showUserError(e);
        expect.fail();
      }
    }).timeout(Duration.ofMinutes(1).toMillis());

    // trigger some extra transactions to trigger MirrorNode to fetch the transactions
    accountCreationShouldSucceed(accountManager, mirrorNodeCmd, namespace);
    accountCreationShouldSucceed(accountManager, mirrorNodeCmd, namespace);

    it('Check submit message result should success', async () => {
      try {
        const queryURL = `http://localhost:8080/api/v1/topics/${newTopicId}/messages`;
        let received = false;
        let receivedMessage = '';

        // wait until the transaction reached consensus and retrievable from the mirror node API
        while (!received) {
          const req = http.request(queryURL, {method: 'GET', timeout: 100, headers: {Connection: 'close'}}, res => {
            res.setEncoding('utf8');
            res.on('data', chunk => {
              // convert chunk to json object
              const obj = JSON.parse(chunk);
              if (obj.messages.length === 0) {
                mirrorNodeCmd.logger.debug('No messages yet');
              } else {
                // convert message from base64 to utf-8
                const base64 = obj.messages[0].message;
                const buff = Buffer.from(base64, 'base64');
                receivedMessage = buff.toString('utf-8');
                mirrorNodeCmd.logger.debug(`Received message: ${receivedMessage}`);
                received = true;
              }
            });
          });
          req.on('error', e => {
            mirrorNodeCmd.logger.debug(`problem with request: ${e.message}`);
          });
          req.end(); // make the request
          await sleep(Duration.ofSeconds(2));
        }
        await sleep(Duration.ofSeconds(1));
        expect(receivedMessage).to.equal(testMessage);
        await k8.stopPortForward(portForwarder);
      } catch (e) {
        mirrorNodeCmd.logger.showUserError(e);
        expect.fail();
      }
    }).timeout(Duration.ofMinutes(5).toMillis());

    it('mirror node destroy should success', async () => {
      try {
        expect(await mirrorNodeCmd.destroy(argv)).to.be.true;
        expect(await explorerCommand.destroy(argv)).to.be.true;
      } catch (e) {
        mirrorNodeCmd.logger.showUserError(e);
        expect.fail();
      }
    }).timeout(Duration.ofMinutes(1).toMillis());
  });
});
