// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  BLOCK_NODE_EDGE_VERSION,
  BLOCK_NODE_VERSION,
  EXPLORER_EDGE_VERSION,
  EXPLORER_VERSION,
  getSoloVersion,
  HEDERA_JSON_RPC_RELAY_EDGE_VERSION,
  HEDERA_JSON_RPC_RELAY_VERSION,
  HEDERA_PLATFORM_EDGE_VERSION,
  HEDERA_PLATFORM_VERSION,
  MIRROR_NODE_EDGE_VERSION,
  MIRROR_NODE_VERSION,
  SOLO_CHART_EDGE_VERSION,
  SOLO_CHART_VERSION,
} from '../../version.js';
import {type Version} from '../../src/types/index.js';
import {SemanticVersion} from '../../src/business/utils/semantic-version.js';

describe('getSoloVersion', (): void => {
  const fileName: string = fileURLToPath(import.meta.url);
  const directoryName: string = path.dirname(fileName);
  const rootPackageJsonPath: string = path.resolve(directoryName, '../../package.json');
  const expectedVersion: Version = (JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8')) as {version: Version})
    .version;

  let originalNpmPackageVersion: string | undefined;

  beforeEach((): void => {
    originalNpmPackageVersion = process.env.npm_package_version;
  });

  afterEach((): void => {
    if (originalNpmPackageVersion === undefined) {
      delete process.env.npm_package_version;
    } else {
      process.env.npm_package_version = originalNpmPackageVersion;
    }
  });

  it('ignores npm_package_version set by a consuming Node.js project', (): void => {
    process.env.npm_package_version = '99.99.99';
    const version: Version = getSoloVersion();
    expect(version).to.not.equal('99.99.99');
    expect(version).to.equal(expectedVersion);
  });

  it('reads the version from package.json when npm_package_version is unset', (): void => {
    delete process.env.npm_package_version;
    expect(getSoloVersion()).to.equal(expectedVersion);
  });
});

describe('edge component versions', (): void => {
  const componentVersions: Array<{component: string; edge: string; standard: string}> = [
    {component: 'solo chart', edge: SOLO_CHART_EDGE_VERSION, standard: SOLO_CHART_VERSION},
    {component: 'consensus node', edge: HEDERA_PLATFORM_EDGE_VERSION, standard: HEDERA_PLATFORM_VERSION},
    {component: 'mirror node', edge: MIRROR_NODE_EDGE_VERSION, standard: MIRROR_NODE_VERSION},
    {component: 'explorer', edge: EXPLORER_EDGE_VERSION, standard: EXPLORER_VERSION},
    {component: 'relay', edge: HEDERA_JSON_RPC_RELAY_EDGE_VERSION, standard: HEDERA_JSON_RPC_RELAY_VERSION},
    {component: 'block node', edge: BLOCK_NODE_EDGE_VERSION, standard: BLOCK_NODE_VERSION},
  ];

  for (const {component, edge, standard} of componentVersions) {
    it(`${component} edge version is not older than the default version`, (): void => {
      expect(
        new SemanticVersion<string>(edge).greaterThanOrEqual(standard),
        `${component} edge version ${edge} is older than the default version ${standard}`,
      ).to.be.true;
    });
  }
});
