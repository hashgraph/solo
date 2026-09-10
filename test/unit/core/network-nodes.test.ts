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

  describe('isFreezeStateArchive', (): void => {
    let temporaryDirectory: string;

    beforeEach((): void => {
      temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'freeze-archive-test-'));
    });

    afterEach((): void => {
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    });

    /** Build a state archive holding one round directory per supplied round. */
    function writeStateArchive(rounds: {round: string; freezeState: string; signingWeight?: string}[]): string {
      const archive: AdmZip = new AdmZip();

      for (const {round, freezeState, signingWeight} of rounds) {
        archive.addFile(
          `com.hedera.services.ServicesMain/0/123/${round}/stateMetadata.txt`,
          Buffer.from(`FREEZE_STATE: ${freezeState}\nSIGNING_WEIGHT_SUM: ${signingWeight ?? '3'}\nTOTAL_WEIGHT: 3\n`),
        );
      }

      const archivePath: string = path.join(temporaryDirectory, 'network-node1-0-state.zip');
      archive.writeZip(archivePath);
      return archivePath;
    }

    it('should detect an archive captured from a freeze state', (): void => {
      const archivePath: string = writeStateArchive([{round: '200', freezeState: 'true'}]);
      expect(networkNodes.isFreezeStateArchive(archivePath)).to.equal(true);
    });

    it('should detect an archive captured from a stopped node', (): void => {
      const archivePath: string = writeStateArchive([{round: '200', freezeState: 'false'}]);
      expect(networkNodes.isFreezeStateArchive(archivePath)).to.equal(false);
    });

    it('should read the highest round when the archive holds several', (): void => {
      const archivePath: string = writeStateArchive([
        {freezeState: 'false', round: '100'},
        {freezeState: 'true', round: '200'},
      ]);
      expect(networkNodes.isFreezeStateArchive(archivePath)).to.equal(true);
    });

    it('should read a single-round archive that has no round directory', (): void => {
      const archive: AdmZip = new AdmZip();
      archive.addFile('stateMetadata.txt', Buffer.from('FREEZE_STATE: true\n'));
      const archivePath: string = path.join(temporaryDirectory, 'node-add-state.zip');
      archive.writeZip(archivePath);

      expect(networkNodes.isFreezeStateArchive(archivePath)).to.equal(true);
    });

    it('should fall back to a non-freeze restore when no metadata is present', (): void => {
      const archive: AdmZip = new AdmZip();
      archive.addFile('com.hedera.services.ServicesMain/0/123/200/other.txt', Buffer.from('no metadata here'));
      const archivePath: string = path.join(temporaryDirectory, 'no-metadata-state.zip');
      archive.writeZip(archivePath);

      expect(networkNodes.isFreezeStateArchive(archivePath)).to.equal(false);
    });

    it('should fall back to a non-freeze restore when the archive cannot be read', (): void => {
      const archivePath: string = path.join(temporaryDirectory, 'missing-state.zip');
      expect(networkNodes.isFreezeStateArchive(archivePath)).to.equal(false);
    });
  });
});
