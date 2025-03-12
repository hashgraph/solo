// SPDX-License-Identifier: Apache-2.0

import {readFileSync} from 'fs';
import {loadYaml} from '@kubernetes/client-node';
import {expect} from 'chai';
import {beforeEach} from 'mocha';
import os from 'os';
import {RemoteConfig} from '../../../../../src/data/schema/model/remote/remote_config.js';
import {instanceToPlain, plainToClass} from 'class-transformer';

function migrateVersionPrefix(version: string): string {
  const strippedVersionPrefix: string = version.replace(/^v/, '');
  const parts = strippedVersionPrefix.split('.').map(Number); // Split and convert to numbers
  while (parts.length < 3) {
    parts.push(0); // Add missing minor/patch as 0
  }
  return parts.join('.');
}

function migrateVersions(plainObject: object) {
  plainObject['versions'] = {};
  plainObject['versions']['cli'] = migrateVersionPrefix(plainObject['metadata']?.['soloVersion'] || '0.0.0');
  plainObject['versions']['chart'] = migrateVersionPrefix(plainObject['metadata']?.['soloChartVersion'] || '0.0.0');
  plainObject['versions']['consensusNode'] = migrateVersionPrefix(
    plainObject['metadata']?.['hederaPlatformVersion'] || plainObject['flags']?.['releaseTag'] || '0.0.0',
  );
  plainObject['versions']['mirrorNodeChart'] = migrateVersionPrefix(
    plainObject['metadata']?.['hederaMirrorNodeChartVersion'] || plainObject['flags']?.['mirrorNodeVersion'] || '0.0.0',
  );
  plainObject['versions']['explorerChart'] = migrateVersionPrefix(
    plainObject['metadata']?.['hederaExplorerChartVersion'] ||
      plainObject['flags']?.['hederaExplorerVersion'] ||
      '0.0.0',
  );
  plainObject['versions']['jsonRpcRelayChart'] = migrateVersionPrefix(
    plainObject['metadata']?.['hederaJsonRpcRelayChartVersion'] || plainObject['flags']?.['relayReleaseTag'] || '0.0.0',
  );
}

function migrateClusters(plainObject: object) {
  const clusters: object = plainObject['clusters'];
  const clustersArray: object[] = [];
  for (const key in clusters) {
    expect(clusters[key]).to.not.be.undefined.and.to.not.be.null;
    const cluster = clusters[key];
    clustersArray.push(cluster);
  }
  plainObject['clusters'] = clustersArray;
}

function migrateHistory(plainObject: object) {
  plainObject['history'] = {};
  plainObject['history']['commands'] = [];
  for (const historyItem of plainObject['commandHistory']) {
    plainObject['history']['commands'].push(historyItem);
  }
}

function migrate(plainObject: object): void {
  plainObject['schemaVersion'] = 0;

  const meta: object = plainObject['metadata'];
  meta['lastUpdatedBy'] = {
    name: os.userInfo().username,
    hostname: os.hostname(),
  };

  migrateClusters(plainObject);
  migrateVersions(plainObject);
  migrateHistory(plainObject);
}

describe('RemoteConfig', () => {
  const remoteConfigPath = 'test/data/v0-34-0-remote-config.yaml';

  describe('Class Transformer', () => {
    let yamlData: string;
    let plainObject: object;

    beforeEach(() => {
      yamlData = readFileSync(remoteConfigPath, 'utf8');
      expect(yamlData).to.not.be.undefined.and.to.not.be.null;

      plainObject = loadYaml<object>(yamlData);
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
    });

    it('should transform class to plain', async () => {
      const rc: RemoteConfig = plainToClass(RemoteConfig, plainObject);
      const remoteConfigObject = instanceToPlain(rc);
      expect(remoteConfigObject).to.not.be.undefined.and.to.not.be.null;
    });
  });
});
