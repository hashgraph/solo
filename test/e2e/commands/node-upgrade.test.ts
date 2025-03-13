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
import {PodRef} from '../../../src/core/kube/resources/pod/pod-ref.js';
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
      const tmpDir = getTmpDir();
      fs.writeFileSync(`${tmpDir}/version.txt`, TEST_VERSION_STRING);

      // create upgrade.zip file from tmp directory using zippy.ts
      const zipper = new Zippy(logger);
      await zipper.zip(tmpDir, zipFile);

      const tempDir = 'contextDir';

      argv.setArg(flags.upgradeZipFile, zipFile);
      argv.setArg(flags.outputDir, tempDir);
      argv.setArg(flags.inputDir, tempDir);

      await commandInvoker.invoke({
        argv: argv,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'upgrade',
        callback: async argv => nodeCmd.handlers.upgrade(argv),
      });
    }).timeout(Duration.ofMinutes(5).toMillis());

    it('network nodes version file was upgraded', async () => {
      // copy the version.txt file from the pod data/upgrade/current directory
      const tmpDir = getTmpDir();
      const pods: Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);
      await k8Factory
        .default()
        .containers()
        .readByRef(ContainerRef.of(PodRef.of(namespace, pods[0].podRef.name), ROOT_CONTAINER))
        .copyFrom(`${HEDERA_HAPI_PATH}/data/upgrade/current/version.txt`, tmpDir);

      // compare the version.txt
      const version = fs.readFileSync(`${tmpDir}/version.txt`, 'utf8');
      expect(version).to.equal(TEST_VERSION_STRING);
    }).timeout(Duration.ofMinutes(5).toMillis());
  });
});
