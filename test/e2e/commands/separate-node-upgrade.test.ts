// SPDX-License-Identifier: Apache-2.0

import {after, describe, it} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {e2eTestSuite, getTmpDir, HEDERA_PLATFORM_VERSION_TAG} from '../../test-util.js';
import {Duration} from '../../../src/core/time/duration.js';
import {HEDERA_HAPI_PATH, ROOT_CONTAINER} from '../../../src/core/constants.js';
import fs from 'fs';
import {Zippy} from '../../../src/core/zippy.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace-name.js';
import {type PodRef} from '../../../src/core/kube/resources/pod/pod-ref.js';
import {ContainerRef} from '../../../src/core/kube/resources/container/container-ref.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {AccountCommand} from '../../../src/commands/account.js';
import {NodeCommand} from '../../../src/commands/node/index.js';
import {type Pod} from '../../../src/core/kube/resources/pod/pod.js';

const namespace = NamespaceName.of('node-upgrade');
const argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.persistentVolumeClaims, true);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.namespace, namespace.name);

const zipFile = 'upgrade.zip';

const TEST_VERSION_STRING = '0.100.0';

e2eTestSuite(namespace.name, argv, {}, bootstrapResp => {
  const {
    opts: {k8Factory, logger, commandInvoker},
    cmd: {nodeCmd, accountCmd},
  } = bootstrapResp;

  describe('Node upgrade', async () => {
    after(async function () {
      this.timeout(Duration.ofMinutes(10).toMillis());

      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await k8Factory.default().namespaces().delete(namespace);
    });

    it('should succeed with init command', async () => {
      await commandInvoker.invoke({
        argv: argv,
        command: AccountCommand.COMMAND_NAME,
        subcommand: 'init',
        callback: async argv => accountCmd.init(argv),
      });
    }).timeout(Duration.ofMinutes(8).toMillis());

    it('should succeed with separate upgrade command', async () => {
      // create file version.txt at tmp directory
      const tmpDir = getTmpDir();
      fs.writeFileSync(`${tmpDir}/version.txt`, TEST_VERSION_STRING);

      // create upgrade.zip file from tmp directory using zippy.ts
      const zipper = new Zippy(logger);
      await zipper.zip(tmpDir, zipFile);

      const tempDir = 'contextDir';

      const argvPrepare = argv.clone();
      argvPrepare.setArg(flags.upgradeZipFile, zipFile);
      argvPrepare.setArg(flags.outputDir, tempDir);

      const argvExecute = Argv.getDefaultArgv(namespace);
      argvExecute.setArg(flags.inputDir, tempDir);

      await commandInvoker.invoke({
        argv: argvPrepare,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'upgrade-prepare',
        callback: async argv => nodeCmd.handlers.upgradePrepare(argv),
      });

      await commandInvoker.invoke({
        argv: argvExecute,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'upgrade-submit-transactions',
        callback: async argv => nodeCmd.handlers.upgradeSubmitTransactions(argv),
      });

      await commandInvoker.invoke({
        argv: argvExecute,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'upgrade-execute',
        callback: async argv => nodeCmd.handlers.upgradeExecute(argv),
      });
    }).timeout(Duration.ofMinutes(5).toMillis());

    it('network nodes version file was upgraded', async () => {
      // copy the version.txt file from the pod data/upgrade/current directory
      const tmpDir: string = getTmpDir();
      const pods: Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);
      const podRef: PodRef = pods[0].podRef;
      const containerRef: ContainerRef = ContainerRef.of(podRef, ROOT_CONTAINER);
      await k8Factory
        .default()
        .containers()
        .readByRef(containerRef)
        .copyFrom(`${HEDERA_HAPI_PATH}/data/upgrade/current/version.txt`, tmpDir);

      // compare the version.txt
      const version: string = fs.readFileSync(`${tmpDir}/version.txt`, 'utf8');
      expect(version).to.equal(TEST_VERSION_STRING);
    }).timeout(Duration.ofMinutes(5).toMillis());
  });
});
