// SPDX-License-Identifier: Apache-2.0

import {after, before, describe, it} from 'mocha';
import {expect} from 'chai';

import * as constants from '../../../../src/core/constants.js';
import * as fs from 'node:fs';

import {endToEndTestSuite, getTestCacheDirectory, getTestCluster, getTestLogger} from '../../../test-utility.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import * as version from '../../../../version.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {ContainerReference} from '../../../../src/integration/kube/resources/container/container-reference.js';
import {Argv} from '../../../helpers/argv-wrapper.js';
import {SoloError} from '../../../../src/core/errors/solo-error.js';

const defaultTimeout: number = Duration.ofSeconds(20).toMillis();

const namespace: NamespaceName = NamespaceName.of('pkg-installer-e2e');
const argv: Argv = Argv.getDefaultArgv(namespace);
const testCacheDirectory: string = getTestCacheDirectory();
argv.setArg(flags.cacheDir, testCacheDirectory);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.nodeAliasesUnparsed, 'node1');
argv.setArg(flags.clusterRef, getTestCluster());
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.enableMonitoringSupport, false);

endToEndTestSuite(namespace.name, argv, {startNodes: false}, ({opts}): void => {
  describe('Platform Installer E2E', async (): Promise<void> => {
    const {k8Factory, accountManager, platformInstaller} = opts;
    const podReference: PodReference = PodReference.of(namespace, PodName.of('network-node1-0'));
    const packageVersion: string = 'v0.42.5';
    let zipPath: string;
    let checksumPath: string;

    before(async (): Promise<void> => {
      if (!fs.existsSync(testCacheDirectory)) {
        fs.mkdirSync(testCacheDirectory);
      }
      [zipPath, checksumPath] = await platformInstaller.getPlatformRelease(testCacheDirectory, packageVersion);
    }).timeout(Duration.ofMinutes(5).toMillis());

    after(async (): Promise<void> => {
      await k8Factory.default().namespaces().delete(namespace);
      await accountManager.close();
    }).timeout(Duration.ofMinutes(5).toMillis());

    it('should fail with invalid pod', async (): Promise<void> => {
      try {
        await platformInstaller.fetchPlatform(undefined, packageVersion, zipPath, checksumPath);
        expect.fail();
      } catch (error) {
        expect(error.message).to.include('podReference is required');
      }

      try {
        await platformInstaller.fetchPlatform(
          PodReference.of(NamespaceName.of('valid-namespace'), PodName.of('INVALID_POD')),
          packageVersion,
          zipPath,
          checksumPath,
        );
        expect.fail();
      } catch (error) {
        expect(error.message).to.include('must be a valid RFC-1123 DNS label');
      }
    }).timeout(defaultTimeout);

    it('should fail with invalid tag', async (): Promise<void> => {
      try {
        await platformInstaller.fetchPlatform(podReference, 'INVALID', zipPath, checksumPath);
        expect.fail();
      } catch (error) {
        expect(error).to.be.instanceOf(SoloError);
      }
    }).timeout(defaultTimeout);

    it('should succeed with valid tag and pod', async (): Promise<void> => {
      expect(await platformInstaller.fetchPlatform(podReference, packageVersion, zipPath, checksumPath)).to.be.true;
      const outputs: string = await k8Factory
        .default()
        .containers()
        .readByRef(ContainerReference.of(podReference, constants.ROOT_CONTAINER))
        .execContainer(`ls -la ${constants.HEDERA_HAPI_PATH}`);

      getTestLogger().showUser(outputs);
    }).timeout(Duration.ofMinutes(1).toMillis());
  });
});
