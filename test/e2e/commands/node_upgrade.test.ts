/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {it, describe, after} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {e2eTestSuite, getDefaultArgv, getTmpDir, HEDERA_PLATFORM_VERSION_TAG} from '../../test_util.js';
import {UPGRADE_CONFIGS_NAME} from '../../../src/commands/node/configs.js';
import {Duration} from '../../../src/core/time/duration.js';
import {HEDERA_HAPI_PATH, ROOT_CONTAINER} from '../../../src/core/constants.js';
import type {PodName} from '../../../src/types/aliases.js';
import fs from 'fs';
import {Zippy} from '../../../src/core/zippy.js';

const namespace = 'node-upgrade';
const argv = getDefaultArgv();
argv[flags.nodeAliasesUnparsed.name] = 'node1,node2';
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
argv[flags.persistentVolumeClaims.name] = true;
// set the env variable SOLO_CHARTS_DIR if developer wants to use local solo charts
argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ? process.env.SOLO_CHARTS_DIR : undefined;
argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG;
argv[flags.namespace.name] = namespace;

const zipFile = 'upgrade.zip';

const TEST_VERSION_STRING = '0.100.0';

e2eTestSuite(namespace, argv, undefined, undefined, undefined, undefined, undefined, undefined, true, bootstrapResp => {
  describe('Node upgrade', async () => {
    const nodeCmd = bootstrapResp.cmd.nodeCmd;
    const accountCmd = bootstrapResp.cmd.accountCmd;
    const k8 = bootstrapResp.opts.k8;

    after(async function () {
      this.timeout(Duration.ofMinutes(10).toMillis());

      await k8.getNodeLogs(namespace);
      await k8.deleteNamespace(namespace);
    });

    it('should succeed with init command', async () => {
      const status = await accountCmd.init(argv);
      expect(status).to.be.ok;
    }).timeout(Duration.ofMinutes(8).toMillis());

    it('should succeed with upgrade', async () => {
      // create file version.txt at tmp directory
      const tmpDir = getTmpDir();
      fs.writeFileSync(`${tmpDir}/version.txt`, TEST_VERSION_STRING);

      // create upgrade.zip file from tmp directory using zippy.ts
      const zipper = new Zippy(nodeCmd.logger);
      await zipper.zip(tmpDir, zipFile);

      const tempDir = 'contextDir';

      argv[flags.upgradeZipFile.name] = zipFile;
      argv[flags.outputDir.name] = tempDir;
      argv[flags.inputDir.name] = tempDir;
      await nodeCmd.handlers.upgrade(argv);

      expect(nodeCmd.getUnusedConfigs(UPGRADE_CONFIGS_NAME)).to.deep.equal([
        flags.devMode.constName,
        flags.quiet.constName,
        flags.localBuildPath.constName,
        flags.force.constName,
      ]);
    }).timeout(Duration.ofMinutes(5).toMillis());

    it('network nodes version file was upgraded', async () => {
      // copy the version.txt file from the pod data/upgrade/current directory
      const tmpDir = getTmpDir();
      const pods = await k8.getPodsByLabel(['solo.hedera.com/type=network-node']);
      const podName = pods[0].metadata.name as PodName;
      await k8.copyFrom(podName, ROOT_CONTAINER, `${HEDERA_HAPI_PATH}/data/upgrade/current/version.txt`, tmpDir);

      // compare the version.txt
      const version = fs.readFileSync(`${tmpDir}/version.txt`, 'utf8');
      expect(version).to.equal(TEST_VERSION_STRING);
    }).timeout(Duration.ofMinutes(5).toMillis());
  });
});
