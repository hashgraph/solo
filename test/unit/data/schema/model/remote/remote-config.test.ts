// SPDX-License-Identifier: Apache-2.0

import {readFileSync} from 'node:fs';
import {parse} from 'yaml';
import {expect} from 'chai';
import {beforeEach} from 'mocha';
import os from 'node:os';
import {instanceToPlain, plainToInstance} from 'class-transformer';
import {RemoteConfigSchema} from '../../../../../../src/data/schema/model/remote/remote-config-schema.js';
import {LedgerPhase} from '../../../../../../src/data/schema/model/remote/ledger-phase.js';
import {DeploymentPhase} from '../../../../../../src/data/schema/model/remote/deployment-phase.js';

type MigrationCandidate = Record<string, unknown>;

function migrateVersionPrefix(version: string): string {
  const strippedVersionPrefix: string = version.replace(/^v/, '');
  const parts: number[] = strippedVersionPrefix.split('.').map(Number); // Split and convert to numbers
  while (parts.length < 3) {
    parts.push(0); // Add missing minor/patch as 0
  }
  return parts.join('.');
}

function migrateVersions(plainObject: MigrationCandidate): void {
  const metadata: MigrationCandidate = (plainObject.metadata as MigrationCandidate) ?? {};
  const flags: MigrationCandidate = (plainObject.flags as MigrationCandidate) ?? {};

  plainObject.versions = {
    cli: migrateVersionPrefix((metadata.soloVersion as string) || '0.0.0'),
    chart: migrateVersionPrefix((metadata.soloChartVersion as string) || '0.0.0'),
    consensusNode: migrateVersionPrefix(
      (metadata.hederaPlatformVersion as string) || (flags.releaseTag as string) || '0.0.0',
    ),
    mirrorNodeChart: migrateVersionPrefix(
      (metadata.hederaMirrorNodeChartVersion as string) || (flags.mirrorNodeVersion as string) || '0.0.0',
    ),
    explorerChart: migrateVersionPrefix(
      (metadata.explorerChartVersion as string) || (flags.explorerVersion as string) || '0.0.0',
    ),
    jsonRpcRelayChart: migrateVersionPrefix(
      (metadata.hederaJsonRpcRelayChartVersion as string) || (flags.relayReleaseTag as string) || '0.0.0',
    ),
    blockNodeChart: 'v0.0.0',
  };
}

function migrateClusters(plainObject: MigrationCandidate): void {
  const clusters: MigrationCandidate = (plainObject.clusters as MigrationCandidate) ?? {};
  const clustersArray: unknown[] = [];
  for (const key of Object.keys(clusters)) {
    expect(clusters[key]).to.not.be.undefined.and.to.not.be.null;
    clustersArray.push(clusters[key]);
  }
  plainObject.clusters = clustersArray;
}

function migrateHistory(plainObject: MigrationCandidate): void {
  const commandHistory: unknown[] = (plainObject.commandHistory as unknown[]) ?? [];
  plainObject.history = {commands: [...commandHistory]};
}

function migrateConsensusNodes(plainObject: MigrationCandidate, state: MigrationCandidate): void {
  const components: MigrationCandidate = (plainObject.components as MigrationCandidate) ?? {};
  const consensusNodes: MigrationCandidate = (components.consensusNodes as MigrationCandidate) ?? {};
  const migratedConsensusNodes: unknown[] = [];

  for (const plainConsensusNodeKey of Object.keys(consensusNodes)) {
    const oldConsensusNode: MigrationCandidate = consensusNodes[plainConsensusNodeKey] as MigrationCandidate;
    let migratedState: string;
    switch (oldConsensusNode.state) {
      case 'requested': {
        migratedState = DeploymentPhase.REQUESTED;
        break;
      }
      case 'initialized': {
        migratedState = DeploymentPhase.DEPLOYED;
        break;
      }
      case 'setup': {
        migratedState = DeploymentPhase.CONFIGURED;
        break;
      }
      case 'started': {
        migratedState = DeploymentPhase.STARTED;
        break;
      }
      case 'freezed': {
        migratedState = DeploymentPhase.FROZEN;
        break;
      }
      case 'stopped': {
        migratedState = DeploymentPhase.STOPPED;
        break;
      }
    }
    migratedConsensusNodes.push({
      metadata: {
        id: (oldConsensusNode.nodeId as number) + 1,
        namespace: oldConsensusNode.namespace,
        cluster: oldConsensusNode.cluster,
        phase: migratedState,
      },
    });
  }
  state.consensusNodes = migratedConsensusNodes;
}

function migrateHaProxies(state: MigrationCandidate): void {
  state.haProxies = [];
}

function migrateEnvoyProxies(state: MigrationCandidate): void {
  state.envoyProxies = [];
}

function migrateMirrorNodes(state: MigrationCandidate): void {
  state.mirrorNodes = [];
}

function migrateExplorers(state: MigrationCandidate): void {
  state.explorers = [];
}

function migrateJsonRpcRelays(state: MigrationCandidate): void {
  state.relayNodes = [];
}

function migrateState(plainObject: MigrationCandidate): void {
  const state: MigrationCandidate = {ledgerPhase: LedgerPhase.UNINITIALIZED};
  migrateConsensusNodes(plainObject, state);
  migrateHaProxies(state);
  migrateEnvoyProxies(state);
  migrateMirrorNodes(state);
  migrateExplorers(state);
  migrateJsonRpcRelays(state);
  plainObject.state = state;
}

function migrate(plainObject: MigrationCandidate): void {
  plainObject.schemaVersion = 0;

  const meta: MigrationCandidate = (plainObject.metadata as MigrationCandidate) ?? {};
  meta.lastUpdatedBy = {
    name: os.userInfo().username,
    hostname: os.hostname(),
  };
  plainObject.metadata = meta;

  migrateClusters(plainObject);
  migrateVersions(plainObject);
  migrateHistory(plainObject);
  migrateState(plainObject);
}

function expectRemoteConfigClass(rc: RemoteConfigSchema): void {
  expect(rc).to.not.be.undefined.and.to.not.be.null;
  expect(rc.history.commands.length).to.be.equal(9);
  expect(rc.versions.cli.toString()).to.equal('0.34.0');
  expect(rc.versions.chart.toString()).to.equal('0.44.0');
  expect(rc.versions.consensusNode.toString()).to.equal('0.58.10');
  expect(rc.versions.mirrorNodeChart.toString()).to.equal('0.122.0');
  expect(rc.versions.explorerChart.toString()).to.equal('24.12.0');
  expect(rc.versions.jsonRpcRelayChart.toString()).to.equal('0.63.2');
  expect(rc.clusters.length).to.be.equal(1);
  expect(rc.state.consensusNodes.length).to.be.equal(4);
  expect(rc.state.consensusNodes[0].metadata.id).to.be.equal(1);
  expect(rc.state.consensusNodes[0].metadata.namespace).to.be.equal('solo-alpha-prod');
  expect(rc.state.consensusNodes[0].metadata.cluster).to.be.equal('gke-alpha-prod-us-central1');
  expect(rc.state.consensusNodes[0].metadata.phase).to.be.equal(DeploymentPhase.STARTED);
  expect(rc.state.ledgerPhase).to.be.equal(LedgerPhase.UNINITIALIZED);
}

function expectRemoteConfigPlain(object: MigrationCandidate): void {
  expect(object).to.not.be.undefined.and.to.not.be.null;

  const history: MigrationCandidate = object.history as MigrationCandidate;
  expect((history.commands as unknown[]).length).to.be.equal(9);

  const versions: MigrationCandidate = object.versions as MigrationCandidate;
  expect(versions.cli).to.equal('0.34.0');
  expect(versions.chart).to.equal('0.44.0');
  expect(versions.consensusNode).to.equal('0.58.10');
  expect(versions.mirrorNodeChart).to.equal('0.122.0');
  expect(versions.explorerChart).to.equal('24.12.0');
  expect(versions.jsonRpcRelayChart).to.equal('0.63.2');

  const clusters: unknown[] = object.clusters as unknown[];
  expect(clusters.length).to.be.equal(1);

  const state: MigrationCandidate = object.state as MigrationCandidate;
  const consensusNodes: MigrationCandidate[] = state.consensusNodes as MigrationCandidate[];
  expect(consensusNodes.length).to.be.equal(4);

  const firstConsensusNode: MigrationCandidate = consensusNodes[0].metadata as MigrationCandidate;
  expect(firstConsensusNode.id).to.be.equal(1);
  expect(firstConsensusNode.namespace).to.be.equal('solo-alpha-prod');
  expect(firstConsensusNode.cluster).to.be.equal('gke-alpha-prod-us-central1');
  expect(firstConsensusNode.phase).to.be.equal(DeploymentPhase.STARTED);
  expect(state.ledgerPhase).to.be.equal(LedgerPhase.UNINITIALIZED);
}

describe('RemoteConfig', (): void => {
  const remoteConfigPath: string = 'test/data/v0-35-1-remote-config.yaml';

  describe('Class Transformer', (): void => {
    let yamlData: string;
    let plainObject: MigrationCandidate;

    beforeEach((): void => {
      yamlData = readFileSync(remoteConfigPath, 'utf8');
      expect(yamlData).to.not.be.undefined.and.to.not.be.null;

      plainObject = parse(yamlData) as MigrationCandidate;
      expect(plainObject).to.not.be.undefined.and.to.not.be.null;

      migrate(plainObject);
    });

    it('should transform plain to class', async (): Promise<void> => {
      const rc: RemoteConfigSchema = plainToInstance(RemoteConfigSchema, plainObject);
      expectRemoteConfigClass(rc);
    });

    it('should transform class to plain', async (): Promise<void> => {
      const rc: RemoteConfigSchema = plainToInstance(RemoteConfigSchema, plainObject);
      const plainRemoteConfigObject: MigrationCandidate = instanceToPlain(rc);
      expectRemoteConfigPlain(plainRemoteConfigObject);
    });

    it('should be able to go from a class to an object back to a class', async (): Promise<void> => {
      const rc: RemoteConfigSchema = plainToInstance(RemoteConfigSchema, plainObject);
      const plainRemoteConfigObject: MigrationCandidate = instanceToPlain(rc);
      const rc2: RemoteConfigSchema = plainToInstance(RemoteConfigSchema, plainRemoteConfigObject);
      expectRemoteConfigClass(rc2);
    });
  });
});
