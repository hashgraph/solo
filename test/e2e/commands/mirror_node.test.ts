// SPDX-License-Identifier: Apache-2.0

import {after, afterEach, before, describe, it} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  e2eTestSuite,
  getTestCluster,
  HEDERA_PLATFORM_VERSION_TAG,
} from '../../test_util.js';
import * as version from '../../../version.js';
import {sleep} from '../../../src/core/helpers.js';
import {MirrorNodeCommand} from '../../../src/commands/mirror_node.js';
import {PrivateKey, Status, TopicCreateTransaction, TopicMessageSubmitTransaction} from '@hashgraph/sdk';
import * as http from 'http';
import {PackageDownloader} from '../../../src/core/package_downloader.js';
import {Duration} from '../../../src/core/time/duration.js';
import {ExplorerCommand} from '../../../src/commands/explorer.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace_name.js';
import {type NetworkNodes} from '../../../src/core/network_nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency_injection/inject_tokens.js';
import {type DeploymentName} from '../../../src/core/config/remote/types.js';
import {Argv} from '../../helpers/argv_wrapper.js';
import {GENESIS_KEY} from '../../../src/core/constants.js';
import {type Pod} from '../../../src/core/kube/resources/pod/pod.js';

const testName = 'mirror-cmd-e2e';
const namespace = NamespaceName.of(testName);
const argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.forcePortForward, true);
argv.setArg(flags.nodeAliasesUnparsed, 'node1'); // use a single node to reduce resource during e2e tests
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, getTestCluster());
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.force, true);
argv.setArg(flags.relayReleaseTag, flags.relayReleaseTag.definition.defaultValue);
argv.setArg(flags.pinger, true);
argv.setArg(flags.enableHederaExplorerTls, true);
argv.setArg(flags.enableIngress, true);

e2eTestSuite(testName, argv, {}, bootstrapResp => {
  describe('MirrorNodeCommand', async () => {
    const {
      opts: {k8Factory, accountManager, logger, commandInvoker, remoteConfigManager},
    } = bootstrapResp;

    const mirrorNodeCmd = new MirrorNodeCommand(bootstrapResp.opts);
    const explorerCommand = new ExplorerCommand(bootstrapResp.opts);
    const downloader = new PackageDownloader(logger);

    const testMessage = 'Mirror node test message';
    let portForwarder = null;
    let newTopicId = null;

    before(() => {
      logger.showUser(`------------------------- START: ${testName} ----------------------------`);
    });

    after(async function () {
      this.timeout(Duration.ofMinutes(3).toMillis());

      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await k8Factory.default().namespaces().delete(namespace);
      await accountManager.close();

      logger.showUser(`------------------------- END: ${testName} ----------------------------`);
    });

    // give a few ticks so that connections can close
    afterEach(async () => await sleep(Duration.ofMillis(500)));

    balanceQueryShouldSucceed(accountManager, namespace, remoteConfigManager, logger);

    it('mirror node and explorer deploy should success', async () => {
      try {
        await commandInvoker.invoke({
          argv: argv,
          command: MirrorNodeCommand.COMMAND_NAME,
          subcommand: 'deploy',
          callback: async argv => mirrorNodeCmd.deploy(argv),
        });

        await commandInvoker.invoke({
          argv: argv,
          command: ExplorerCommand.COMMAND_NAME,
          subcommand: 'deploy',
          callback: async argv => explorerCommand.deploy(argv),
        });
      } catch (e) {
        logger.showUserError(e);
        expect.fail();
      }
    }).timeout(Duration.ofMinutes(10).toMillis());

    it('mirror node API should be running', async () => {
      await accountManager.loadNodeClient(
        namespace,
        remoteConfigManager.getClusterRefs(),
        argv.getArg<DeploymentName>(flags.deployment),
        argv.getArg<boolean>(flags.forcePortForward),
      );
      try {
        // find hedera explorer pod
        const pods: Pod[] = await k8Factory
          .default()
          .pods()
          .list(namespace, ['app.kubernetes.io/component=hedera-explorer']);
        const explorerPod: Pod = pods[0];

        portForwarder = await k8Factory.default().pods().readByRef(explorerPod.podRef).portForward(8_080, 8_080);
        await sleep(Duration.ofSeconds(2));

        // check if mirror node api server is running
        const apiURL = 'http://127.0.0.1:8080/api/v1/transactions';
        expect(await downloader.urlExists(apiURL)).to.be.true;
        await sleep(Duration.ofSeconds(2));
      } catch (e) {
        logger.showUserError(e);
        expect.fail();
      }
    }).timeout(Duration.ofMinutes(1).toMillis());

    it('Explorer GUI should be running', async () => {
      try {
        const guiURL = 'http://127.0.0.1:8080/localnet/dashboard';
        expect(await downloader.urlExists(guiURL)).to.be.true;
        await sleep(Duration.ofSeconds(2));

        logger.debug('mirror node API and explorer GUI are running');
      } catch (e) {
        logger.showUserError(e);
        expect.fail();
      }
    }).timeout(Duration.ofMinutes(1).toMillis());

    it('Create topic and submit message should success', async () => {
      try {
        // Create a new public topic and submit a message
        const txResponse = await new TopicCreateTransaction()
          .setAdminKey(PrivateKey.fromStringED25519(GENESIS_KEY))
          .execute(accountManager._nodeClient);
        const receipt = await txResponse.getReceipt(accountManager._nodeClient);
        newTopicId = receipt.topicId;
        logger.debug(`Newly created topic ID is: ${newTopicId}`);

        const submitResponse = await new TopicMessageSubmitTransaction({
          topicId: newTopicId,
          message: testMessage,
        }).execute(accountManager._nodeClient);

        const submitReceipt = await submitResponse.getReceipt(accountManager._nodeClient);
        expect(submitReceipt.status).to.deep.equal(Status.Success);
      } catch (e) {
        logger.showUserError(e);
        expect.fail();
      }
    }).timeout(Duration.ofMinutes(1).toMillis());

    // trigger some extra transactions to trigger MirrorNode to fetch the transactions
    accountCreationShouldSucceed(accountManager, namespace, remoteConfigManager, logger);
    accountCreationShouldSucceed(accountManager, namespace, remoteConfigManager, logger);

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
                logger.debug('No messages yet');
              } else {
                // convert message from base64 to utf-8
                const base64 = obj.messages[0].message;
                const buff = Buffer.from(base64, 'base64');
                receivedMessage = buff.toString('utf-8');
                logger.debug(`Received message: ${receivedMessage}`);
                received = true;
              }
            });
          });
          req.on('error', e => {
            logger.debug(`problem with request: ${e.message}`);
          });
          req.end(); // make the request
          await sleep(Duration.ofSeconds(2));
        }
        await sleep(Duration.ofSeconds(1));
        expect(receivedMessage).to.equal(testMessage);
        await k8Factory.default().pods().readByRef(null).stopPortForward(portForwarder);
      } catch (e) {
        logger.showUserError(e);
        expect.fail();
      }
    }).timeout(Duration.ofMinutes(5).toMillis());

    it('mirror node destroy should success', async () => {
      try {
        await commandInvoker.invoke({
          argv: argv,
          command: MirrorNodeCommand.COMMAND_NAME,
          subcommand: 'destroy',
          callback: async argv => mirrorNodeCmd.destroy(argv),
        });

        await commandInvoker.invoke({
          argv: argv,
          command: ExplorerCommand.COMMAND_NAME,
          subcommand: 'destroy',
          callback: async argv => explorerCommand.destroy(argv),
        });
      } catch (e) {
        logger.showUserError(e);
        expect.fail();
      }
    }).timeout(Duration.ofMinutes(1).toMillis());
  });
});
