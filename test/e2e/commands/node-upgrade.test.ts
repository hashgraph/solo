// SPDX-License-Identifier: Apache-2.0

import {after, describe, it} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {endToEndTestSuite, getTemporaryDirectory, HEDERA_PLATFORM_VERSION_TAG} from '../../test-utility.js';
import {Duration} from '../../../src/core/time/duration.js';
import {HEDERA_HAPI_PATH, ROOT_CONTAINER} from '../../../src/core/constants.js';
import fs from 'node:fs';
import {Zippy} from '../../../src/core/zippy.js';
import {NamespaceName} from '../../../src/integration/kube/resources/namespace/namespace-name.js';
import {PodReference} from '../../../src/integration/kube/resources/pod/pod-reference.js';
import {ContainerReference} from '../../../src/integration/kube/resources/container/container-reference.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {AccountCommand} from '../../../src/commands/account.js';
import {NodeCommand} from '../../../src/commands/node/index.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';

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

endToEndTestSuite(namespace.name, argv, {}, bootstrapResp => {
  const {
    opts: {k8Factory, commandInvoker, logger},
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

    it('should succeed with upgrade', async () => {
      // create file version.txt at tmp directory
      const temporaryDirectory = getTemporaryDirectory();
      fs.writeFileSync(`${temporaryDirectory}/version.txt`, TEST_VERSION_STRING);

      // create upgrade.zip file from tmp directory using zippy.ts
      const zipper = new Zippy(logger);
      await zipper.zip(temporaryDirectory, zipFile);

      const temporaryDirectory2 = 'contextDir';

      argv.setArg(flags.upgradeZipFile, zipFile);
      argv.setArg(flags.outputDir, temporaryDirectory2);
      argv.setArg(flags.inputDir, temporaryDirectory2);

      await commandInvoker.invoke({
        argv: argv,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'upgrade',
        callback: async argv => nodeCmd.handlers.upgrade(argv),
      });
    }).timeout(Duration.ofMinutes(5).toMillis());

    it('network nodes version file was upgraded', async () => {
      // copy the version.txt file from the pod data/upgrade/current directory
      const temporaryDirectory = getTemporaryDirectory();
      const pods: Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);
      await k8Factory
        .default()
        .containers()
        .readByRef(ContainerReference.of(PodReference.of(namespace, pods[0].podReference.name), ROOT_CONTAINER))
        .copyFrom(`${HEDERA_HAPI_PATH}/data/upgrade/current/version.txt`, temporaryDirectory);

      // compare the version.txt
      const version = fs.readFileSync(`${temporaryDirectory}/version.txt`, 'utf8');
      expect(version).to.equal(TEST_VERSION_STRING);
    }).timeout(Duration.ofMinutes(5).toMillis());
  });
});
