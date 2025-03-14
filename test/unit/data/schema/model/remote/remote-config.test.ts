// SPDX-License-Identifier: Apache-2.0

import {readFileSync} from 'fs';
import {parse} from 'yaml';
import {expect} from 'chai';
import {beforeEach} from 'mocha';
import os from 'os';
import {instanceToPlain, plainToClass} from 'class-transformer';
import {RemoteConfig} from '../../../../../../src/data/schema/model/remote/remote-config.js';
import {LedgerPhase} from '../../../../../../src/data/schema/model/remote/ledger-phase.js';
import {DeploymentPhase} from '../../../../../../src/data/schema/model/remote/deployment-phase.js';
type MigrationCandidate = any;

function migrateVersionPrefix(version: string): string {
  const strippedVersionPrefix: string = version.replace(/^v/, '');
  const parts = strippedVersionPrefix.split('.').map(Number); // Split and convert to numbers
  while (parts.length < 3) {
    parts.push(0); // Add missing minor/patch as 0
  }
  return parts.join('.');
}

function migrateVersions(plainObject: MigrationCandidate) {
  plainObject.versions = {};
  plainObject.versions.cli = migrateVersionPrefix(plainObject.metadata?.soloVersion || '0.0.0');
  plainObject.versions.chart = migrateVersionPrefix(plainObject.metadata?.soloChartVersion || '0.0.0');
  plainObject.versions.consensusNode = migrateVersionPrefix(
    plainObject.metadata?.hederaPlatformVersion || plainObject.flags?.releaseTag || '0.0.0',
  );
  plainObject.versions.mirrorNodeChart = migrateVersionPrefix(
    plainObject.metadata?.hederaMirrorNodeChartVersion || plainObject.flags?.mirrorNodeVersion || '0.0.0',
  );
  plainObject.versions.explorerChart = migrateVersionPrefix(
    plainObject.metadata?.hederaExplorerChartVersion || plainObject.flags?.hederaExplorerVersion || '0.0.0',
  );
  plainObject.versions.jsonRpcRelayChart = migrateVersionPrefix(
    plainObject.metadata?.hederaJsonRpcRelayChartVersion || plainObject.flags?.relayReleaseTag || '0.0.0',
  );
}

function migrateClusters(plainObject: MigrationCandidate) {
  const clusters: object = plainObject.clusters;
  const clustersArray: object[] = [];
  for (const key in clusters) {
    expect(clusters[key]).to.not.be.undefined.and.to.not.be.null;
    const cluster = clusters[key];
    clustersArray.push(cluster);
  }
  plainObject.clusters = clustersArray;
}

function migrateHistory(plainObject: MigrationCandidate) {
  plainObject.history = {};
  plainObject.history.commands = [];
  for (const historyItem of plainObject.commandHistory) {
    plainObject.history.commands.push(historyItem);
  }
}

function migrateConsensusNodes(plainObject: MigrationCandidate) {
  plainObject.state.consensusNodes = [];
  for (const plainConsensusNodeKey of Object.keys(plainObject.components?.consensusNodes)) {
    const oldConsensusNode = plainObject.components.consensusNodes[plainConsensusNodeKey];
    let migratedState: string;
    switch (oldConsensusNode.state) {
      case 'requested':
        migratedState = DeploymentPhase.REQUESTED;
        break;
      case 'initialized':
        migratedState = DeploymentPhase.DEPLOYED;
        break;
      case 'setup':
        migratedState = DeploymentPhase.CONFIGURED;
        break;
      case 'started':
        migratedState = DeploymentPhase.STARTED;
        break;
      case 'freezed':
        migratedState = DeploymentPhase.FROZEN;
        break;
      case 'stopped':
        migratedState = DeploymentPhase.STOPPED;
        break;
    }
    const newConsensusNode = {
      id: oldConsensusNode.nodeId,
      name: oldConsensusNode.name,
      namespace: oldConsensusNode.namespace,
      cluster: oldConsensusNode.cluster,
      phase: migratedState,
    };
    plainObject.state.consensusNodes.push(newConsensusNode);
  }
}

function migrateHaProxies(plainObject: MigrationCandidate) {
  plainObject.state.haProxies = [];
}

function migrateEnvoyProxies(plainObject: MigrationCandidate) {
  plainObject.state.envoyProxies = [];
}

function migrateMirrorNodes(plainObject: MigrationCandidate) {
  plainObject.state.mirrorNodes = [];
}

function migrateExplorers(plainObject: MigrationCandidate) {
  plainObject.state.explorers = [];
}

function migrateJsonRpcRelays(plainObject: MigrationCandidate) {
  plainObject.state.relayNodes = [];
}

function migrateState(plainObject: MigrationCandidate) {
  plainObject.state = {};
  plainObject.state.ledgerPhase = LedgerPhase.UNINITIALIZED;
  migrateConsensusNodes(plainObject);
  migrateHaProxies(plainObject);
  migrateEnvoyProxies(plainObject);
  migrateMirrorNodes(plainObject);
  migrateExplorers(plainObject);
  migrateJsonRpcRelays(plainObject);
}

function migrate(plainObject: MigrationCandidate): void {
  plainObject.schemaVersion = 0;

  const meta = plainObject.metadata;
  meta.lastUpdatedBy = {
    name: os.userInfo().username,
    hostname: os.hostname(),
  };

  migrateClusters(plainObject);
  migrateVersions(plainObject);
  migrateHistory(plainObject);
  migrateState(plainObject);
}

describe('RemoteConfig', () => {
  const remoteConfigPath = 'test/data/v0-35-1-remote-config.yaml';

  describe('Class Transformer', () => {
    let yamlData: string;
    let plainObject: MigrationCandidate;

    beforeEach(() => {
      yamlData = readFileSync(remoteConfigPath, 'utf8');
      expect(yamlData).to.not.be.undefined.and.to.not.be.null;

      plainObject = parse(yamlData) as MigrationCandidate;
      expect(plainObject).to.not.be.undefined.and.to.not.be.null;

      migrate(plainObject);
    });

    it('should transform plain to class', async () => {
      const rc: RemoteConfig = plainToClass(RemoteConfig, plainObject);
      expect(rc).to.not.be.undefined.and.to.not.be.null;
      expect(rc.history.commands.length).to.be.equal(1);
      expect(rc.versions.cli.version).to.equal('0.34.0');
      expect(rc.versions.chart.version).to.equal('0.0.0');
      expect(rc.versions.consensusNode.version).to.equal('0.58.10');
      expect(rc.versions.mirrorNodeChart.version).to.equal('0.122.0');
      expect(rc.versions.explorerChart.version).to.equal('24.12.0');
      expect(rc.versions.jsonRpcRelayChart.version).to.equal('0.63.2');
      expect(rc.clusters.length).to.be.equal(1);
      expect(rc.state.consensusNodes.length).to.be.equal(4);
      expect(rc.state.consensusNodes[0].id).to.be.equal(0);
      expect(rc.state.consensusNodes[0].name).to.be.equal('node1');
      expect(rc.state.consensusNodes[0].namespace).to.be.equal('solo-alpha-prod');
      expect(rc.state.consensusNodes[0].cluster).to.be.equal('gke-alpha-prod-us-central1');
      expect(rc.state.consensusNodes[0].phase).to.be.equal(DeploymentPhase.REQUESTED);
      expect(rc.state.ledgerPhase).to.be.equal(LedgerPhase.UNINITIALIZED);
    });

    it('should transform class to plain', async () => {
      const rc: RemoteConfig = plainToClass(RemoteConfig, plainObject);
      const plainRemoteConfigObject = instanceToPlain(rc);
      expect(plainRemoteConfigObject).to.not.be.undefined.and.to.not.be.null;
      expect(plainRemoteConfigObject.history.commands.length).to.be.equal(1);
      expect(plainRemoteConfigObject.versions.cli).to.equal('0.34.0');
      expect(plainRemoteConfigObject.versions.chart).to.equal('0.0.0');
      expect(plainRemoteConfigObject.versions.consensusNode).to.equal('0.58.10');
      expect(plainRemoteConfigObject.versions.mirrorNodeChart).to.equal('0.122.0');
      expect(plainRemoteConfigObject.versions.explorerChart).to.equal('24.12.0');
      expect(plainRemoteConfigObject.versions.jsonRpcRelayChart).to.equal('0.63.2');
      expect(plainRemoteConfigObject.clusters.length).to.be.equal(1);
      expect(plainRemoteConfigObject.state.consensusNodes.length).to.be.equal(4);
      expect(plainRemoteConfigObject.state.consensusNodes[0].id).to.be.equal(0);
      expect(plainRemoteConfigObject.state.consensusNodes[0].name).to.be.equal('node1');
      expect(plainRemoteConfigObject.state.consensusNodes[0].namespace).to.be.equal('solo-alpha-prod');
      expect(plainRemoteConfigObject.state.consensusNodes[0].cluster).to.be.equal('gke-alpha-prod-us-central1');
      expect(plainRemoteConfigObject.state.consensusNodes[0].phase).to.be.equal(DeploymentPhase.REQUESTED);
      expect(plainRemoteConfigObject.state.ledgerPhase).to.be.equal(LedgerPhase.UNINITIALIZED);
    });

    it('should be able to go from a class to an object back to a class', async () => {
      const rc: RemoteConfig = plainToClass(RemoteConfig, plainObject);
      const plainRemoteConfigObject = instanceToPlain(rc);
      const rc2: RemoteConfig = plainToClass(RemoteConfig, plainRemoteConfigObject);
      expect(rc2).to.not.be.undefined.and.to.not.be.null;
      expect(rc2.history.commands.length).to.be.equal(1);
      expect(rc2.versions.cli.version).to.equal('0.34.0');
      expect(rc2.versions.chart.version).to.equal('0.0.0');
      expect(rc2.versions.consensusNode.version).to.equal('0.58.10');
      expect(rc2.versions.mirrorNodeChart.version).to.equal('0.122.0');
      expect(rc2.versions.explorerChart.version).to.equal('24.12.0');
      expect(rc2.versions.jsonRpcRelayChart.version).to.equal('0.63.2');
      expect(rc2.clusters.length).to.be.equal(1);
      expect(rc2.state.consensusNodes.length).to.be.equal(4);
      expect(rc2.state.consensusNodes[0].id).to.be.equal(0);
      expect(rc2.state.consensusNodes[0].name).to.be.equal('node1');
      expect(rc2.state.consensusNodes[0].namespace).to.be.equal('solo-alpha-prod');
      expect(rc2.state.consensusNodes[0].cluster).to.be.equal('gke-alpha-prod-us-central1');
      expect(rc2.state.consensusNodes[0].phase).to.be.equal(DeploymentPhase.REQUESTED);
      expect(rc2.state.ledgerPhase).to.be.equal(LedgerPhase.UNINITIALIZED);
    });
  });
});
