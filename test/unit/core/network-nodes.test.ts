// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';

import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {PodReference} from '../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../src/integration/kube/resources/pod/pod-name.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {DeploymentPhase} from '../../../src/data/schema/model/remote/deployment-phase.js';

describe('NetworkNodes', (): void => {
  let networkNodes: NetworkNodes;
  const podReference: PodReference = PodReference.of(NamespaceName.of('namespace'), PodName.of('network-node1-0'));

  beforeEach((): void => {
    resetForTest();
    networkNodes = container.resolve<NetworkNodes>(InjectTokens.NetworkNodes);
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('should map a platform status metric to its enum name', async (): Promise<void> => {
    sinon
      .stub(networkNodes, 'getNetworkNodePodStatus')
      .resolves('# HELP platform_PlatformStatus\nplatform_PlatformStatus 2');
    const status: string = await networkNodes.getNetworkNodePlatformStatusName(podReference);
    expect(status).to.equal('ACTIVE');
  });

  it('should return UNKNOWN for an empty or garbage response', async (): Promise<void> => {
    sinon.stub(networkNodes, 'getNetworkNodePodStatus').resolves('garbage without a status line');
    const status: string = await networkNodes.getNetworkNodePlatformStatusName(podReference);
    expect(status).to.equal('UNKNOWN');
  });

  it('should return UNKNOWN when the status fetch rejects', async (): Promise<void> => {
    sinon.stub(networkNodes, 'getNetworkNodePodStatus').rejects(new Error('exec failed'));
    const status: string = await networkNodes.getNetworkNodePlatformStatusName(podReference);
    expect(status).to.equal('UNKNOWN');
  });

  it('should normalize node archives to one common signed round', async (): Promise<void> => {
    const temporaryDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'network-nodes-test-'));
    const namespaceDirectory: string = path.join(temporaryDirectory, 'namespace');
    fs.mkdirSync(namespaceDirectory, {recursive: true});

    try {
      for (const nodeAlias of ['node1', 'node2']) {
        const sourceDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'state-source-'));
        for (const [round, freezeState] of [
          ['100', 'false'],
          ['200', 'true'],
        ]) {
          const roundDirectory: string = path.join(
            sourceDirectory,
            'com.hedera.services.ServicesMain',
            '0',
            '123',
            round,
          );
          fs.mkdirSync(roundDirectory, {recursive: true});
          fs.writeFileSync(
            path.join(roundDirectory, 'stateMetadata.txt'),
            `FREEZE_STATE: ${freezeState}\nSIGNING_WEIGHT_SUM: 3\nTOTAL_WEIGHT: 3\n`,
          );
          fs.writeFileSync(path.join(roundDirectory, 'preconsensus-events.pces'), 'pces');
        }

        const archive: AdmZip = new AdmZip();
        archive.addLocalFolder(sourceDirectory);
        await archive.writeZipPromise(path.join(namespaceDirectory, `network-${nodeAlias}-0-state.zip`));
        fs.rmSync(sourceDirectory, {recursive: true, force: true});
      }

      await networkNodes.normalizeDownloadedStateArchives(
        NamespaceName.of('namespace'),
        ['node1', 'node2'],
        temporaryDirectory,
        DeploymentPhase.FROZEN,
      );

      for (const nodeAlias of ['node1', 'node2']) {
        const archive: AdmZip = new AdmZip(path.join(namespaceDirectory, `network-${nodeAlias}-0-state.zip`));
        const entries: string[] = archive.getEntries().map((entry): string => entry.entryName);
        expect(entries.some((entry: string): boolean => entry.includes('/100/'))).to.equal(false);
        expect(entries.some((entry: string): boolean => entry.includes('/200/'))).to.equal(true);
        expect(entries.some((entry: string): boolean => entry.endsWith('preconsensus-events.pces'))).to.equal(true);
      }
    } finally {
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    }
  });
});
