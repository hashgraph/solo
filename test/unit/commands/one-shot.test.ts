// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Flags as flags} from '../../../src/commands/flags.js';
import * as version from '../../../version.js';
import {type ArgvStruct} from '../../../src/types/aliases.js';
import {type OneShotVersionsObject} from '../../../src/commands/one-shot/one-shot-versions-object.js';
import {type SoloConfigFileVersions} from '../../../src/commands/one-shot/solo-config-file-versions.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {DeployArgvBuilders} from '../../../src/commands/one-shot/orchestrator/deploy/deploy-argv-builders.js';

/**
 * Exposes private static methods of DeployArgvBuilders for testing.
 */
interface DeployArgvBuildersInternal {
  findSoloConfigFile(): string | undefined;
  loadVersionsFromSoloConfigFile(): SoloConfigFileVersions;
  resolveOneShotComponentVersions(argv: ArgvStruct, useEdge: boolean): Promise<OneShotVersionsObject>;
}

/**
 * Constructs a minimal one-shot argv with sensible defaults.  The new flags (consensusNodeVersion,
 * relayVersion, blockNodeVersion) use empty-string defaults; the existing flags (mirrorNodeVersion,
 * explorerVersion) use the module-level version constants as their defaults.
 */
const makeArgv: (overrides?: Partial<Record<string, string>>) => ArgvStruct = (
  overrides: Partial<Record<string, string>> = {},
): ArgvStruct => ({
  _: [],
  [flags.consensusNodeVersion.name]: '',
  [flags.mirrorNodeVersion.name]: version.MIRROR_NODE_VERSION,
  [flags.relayVersion.name]: '',
  [flags.explorerVersion.name]: version.EXPLORER_VERSION,
  [flags.blockNodeVersion.name]: '',
  ...overrides,
});

describe('DeployArgvBuilders: version resolution', (): void => {
  let command: DeployArgvBuildersInternal;
  /** Path to a temporary directory created fresh for each test. */
  let temporaryDirectory: string;
  /** Original CWD, restored after each test that calls process.chdir(). */
  let originalCwd: string;

  beforeEach((): void => {
    command = DeployArgvBuilders as unknown as DeployArgvBuildersInternal;
    temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-test-'));
    originalCwd = process.cwd();
  });

  afterEach((): void => {
    sinon.restore();
    // Restore CWD if a test changed it.
    if (process.cwd() !== originalCwd) {
      process.chdir(originalCwd);
    }
    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
  });

  // ---- findSoloConfigFile ----

  describe('findSoloConfigFile', (): void => {
    it('returns undefined when no config file exists in CWD or parents', (): void => {
      process.chdir(temporaryDirectory);
      // temp dir has no solo.config.* files → should return undefined
      expect(command.findSoloConfigFile()).to.be.undefined;
    });

    it('returns the path to solo.config.yaml when it exists in CWD', (): void => {
      const filePath: string = path.join(temporaryDirectory, 'solo.config.yaml');
      fs.writeFileSync(filePath, 'consensusNodeVersion: v0.73.0\n');
      process.chdir(temporaryDirectory);
      expect(fs.realpathSync(command.findSoloConfigFile()!)).to.equal(fs.realpathSync(filePath));
    });

    it('returns the path to solo.config.json when solo.config.yaml is absent', (): void => {
      const filePath: string = path.join(temporaryDirectory, 'solo.config.json');
      fs.writeFileSync(filePath, '{"consensusNodeVersion":"v0.73.0"}');
      process.chdir(temporaryDirectory);
      expect(fs.realpathSync(command.findSoloConfigFile()!)).to.equal(fs.realpathSync(filePath));
    });

    it('prefers solo.config.yaml over solo.config.json', (): void => {
      const yamlPath: string = path.join(temporaryDirectory, 'solo.config.yaml');
      const jsonPath: string = path.join(temporaryDirectory, 'solo.config.json');
      fs.writeFileSync(yamlPath, 'consensusNodeVersion: v0.73.0\n');
      fs.writeFileSync(jsonPath, '{"consensusNodeVersion":"v9.9.9"}');
      process.chdir(temporaryDirectory);
      expect(fs.realpathSync(command.findSoloConfigFile()!)).to.equal(fs.realpathSync(yamlPath));
    });

    it('walks up to a parent directory to find the config file', (): void => {
      const parentPath: string = path.join(temporaryDirectory, 'solo.config.yaml');
      fs.writeFileSync(parentPath, 'consensusNodeVersion: v0.73.0\n');
      // Create a subdirectory and switch to it
      const subdirectory: string = path.join(temporaryDirectory, 'sub');
      fs.mkdirSync(subdirectory);
      process.chdir(subdirectory);
      expect(fs.realpathSync(command.findSoloConfigFile()!)).to.equal(fs.realpathSync(parentPath));
    });
  });

  // ---- loadVersionsFromSoloConfigFile ----

  describe('loadVersionsFromSoloConfigFile', (): void => {
    it('returns empty object when no config file is found', (): void => {
      process.chdir(temporaryDirectory); // temp dir has no config file
      expect(command.loadVersionsFromSoloConfigFile()).to.deep.equal({});
    });

    it('parses camelCase keys from a YAML config file', (): void => {
      fs.writeFileSync(
        path.join(temporaryDirectory, 'solo.config.yaml'),
        [
          'consensusNodeVersion: v0.73.0',
          'mirrorNodeVersion: v0.200.0',
          'relayVersion: "0.77.0"',
          'explorerVersion: "27.0.0"',
          'blockNodeVersion: "0.32.0"',
        ].join('\n'),
      );
      process.chdir(temporaryDirectory);
      expect(command.loadVersionsFromSoloConfigFile()).to.deep.equal({
        consensusNodeVersion: 'v0.73.0',
        mirrorNodeVersion: 'v0.200.0',
        relayVersion: '0.77.0',
        explorerVersion: '27.0.0',
        blockNodeVersion: '0.32.0',
      });
    });

    it('parses kebab-case keys from a YAML config file', (): void => {
      fs.writeFileSync(
        path.join(temporaryDirectory, 'solo.config.yaml'),
        ['consensus-node-version: v0.73.0', 'mirror-node-version: v0.200.0', 'relay-version: "0.77.0"'].join('\n'),
      );
      process.chdir(temporaryDirectory);
      expect(command.loadVersionsFromSoloConfigFile()).to.deep.include({
        consensusNodeVersion: 'v0.73.0',
        mirrorNodeVersion: 'v0.200.0',
        relayVersion: '0.77.0',
      });
    });

    it('parses a JSON config file', (): void => {
      fs.writeFileSync(
        path.join(temporaryDirectory, 'solo.config.json'),
        JSON.stringify({consensusNodeVersion: 'v0.73.0', blockNodeVersion: '0.32.0'}),
      );
      process.chdir(temporaryDirectory);
      expect(command.loadVersionsFromSoloConfigFile()).to.deep.include({
        consensusNodeVersion: 'v0.73.0',
        blockNodeVersion: '0.32.0',
      });
    });

    it('returns empty object when the config file is invalid YAML/JSON', (): void => {
      fs.writeFileSync(path.join(temporaryDirectory, 'solo.config.yaml'), '{bad yaml: [');
      process.chdir(temporaryDirectory);
      expect(command.loadVersionsFromSoloConfigFile()).to.deep.equal({});
    });
  });

  // ---- resolveOneShotComponentVersions ----

  describe('resolveOneShotComponentVersions', (): void => {
    // Stub loadVersionsFromSoloConfigFile so tests are isolated from the filesystem.
    let loadVersionsStub: sinon.SinonStub;

    beforeEach((): void => {
      // Cast to access the private method for stubbing.
      loadVersionsStub = sinon.stub(
        command as unknown as {
          loadVersionsFromSoloConfigFile: () => SoloConfigFileVersions;
        },
        'loadVersionsFromSoloConfigFile',
      );
      loadVersionsStub.returns({});
    });

    it('returns hard-coded defaults when no overrides are provided', async (): Promise<void> => {
      const result: OneShotVersionsObject = await command.resolveOneShotComponentVersions(makeArgv(), false);
      expect(result.consensus).to.equal(version.HEDERA_PLATFORM_VERSION);
      expect(result.mirror).to.equal(version.MIRROR_NODE_VERSION);
      expect(result.relay).to.equal(version.HEDERA_JSON_RPC_RELAY_VERSION);
      expect(result.explorer).to.equal(version.EXPLORER_VERSION);
      expect(result.blockNode).to.equal(version.BLOCK_NODE_VERSION);
      expect(result.soloChart).to.equal(version.SOLO_CHART_VERSION);
    });

    it('returns edge defaults when useEdge is true', async (): Promise<void> => {
      const resolveLatestStableEdgeVersionsStub: sinon.SinonStub = sinon.stub(
        DeployArgvBuilders as unknown as {
          resolveLatestStableEdgeVersions: () => Promise<OneShotVersionsObject>;
        },
        'resolveLatestStableEdgeVersions',
      );
      resolveLatestStableEdgeVersionsStub.resolves({
        soloChart: version.SOLO_CHART_EDGE_VERSION,
        consensus: version.HEDERA_PLATFORM_EDGE_VERSION,
        mirror: version.MIRROR_NODE_EDGE_VERSION,
        relay: version.HEDERA_JSON_RPC_RELAY_EDGE_VERSION,
        explorer: version.EXPLORER_EDGE_VERSION,
        blockNode: version.BLOCK_NODE_EDGE_VERSION,
      });

      const result: OneShotVersionsObject = await command.resolveOneShotComponentVersions(makeArgv(), true);
      expect(result.consensus).to.equal(version.HEDERA_PLATFORM_EDGE_VERSION);
      expect(result.mirror).to.equal(version.MIRROR_NODE_EDGE_VERSION);
      expect(result.relay).to.equal(version.HEDERA_JSON_RPC_RELAY_EDGE_VERSION);
      expect(result.explorer).to.equal(version.EXPLORER_EDGE_VERSION);
      expect(result.blockNode).to.equal(version.BLOCK_NODE_EDGE_VERSION);
      expect(result.soloChart).to.equal(version.SOLO_CHART_EDGE_VERSION);
    });

    it('CLI flags (empty-default) override defaults: consensus, relay, block-node', async (): Promise<void> => {
      const result: OneShotVersionsObject = await command.resolveOneShotComponentVersions(
        makeArgv({
          [flags.consensusNodeVersion.name]: 'v0.73.0',
          [flags.relayVersion.name]: '0.77.0',
          [flags.blockNodeVersion.name]: '0.32.0',
        }),
        false,
      );
      expect(result.consensus).to.equal('v0.73.0');
      expect(result.relay).to.equal('0.77.0');
      expect(result.blockNode).to.equal('0.32.0');
    });

    it('CLI flags override defaults for mirror-node-version and explorer-version', async (): Promise<void> => {
      const result: OneShotVersionsObject = await command.resolveOneShotComponentVersions(
        makeArgv({
          [flags.mirrorNodeVersion.name]: 'v0.999.0',
          [flags.explorerVersion.name]: '99.0.0',
        }),
        false,
      );
      expect(result.mirror).to.equal('v0.999.0');
      expect(result.explorer).to.equal('99.0.0');
    });

    it('config file versions are used when no CLI flag or env var is set', async (): Promise<void> => {
      loadVersionsStub.returns({
        consensusNodeVersion: 'v0.73.0',
        relayVersion: '0.77.0',
        blockNodeVersion: '0.32.0',
      });
      const result: OneShotVersionsObject = await command.resolveOneShotComponentVersions(makeArgv(), false);
      expect(result.consensus).to.equal('v0.73.0');
      expect(result.relay).to.equal('0.77.0');
      expect(result.blockNode).to.equal('0.32.0');
      // mirror and explorer are not in the config file → fall back to defaults
      expect(result.mirror).to.equal(version.MIRROR_NODE_VERSION);
      expect(result.explorer).to.equal(version.EXPLORER_VERSION);
    });

    it('CLI flag takes precedence over config file', async (): Promise<void> => {
      loadVersionsStub.returns({consensusNodeVersion: 'v0.50.0'});
      const result: OneShotVersionsObject = await command.resolveOneShotComponentVersions(
        makeArgv({[flags.consensusNodeVersion.name]: 'v0.73.0'}),
        false,
      );
      // CLI flag wins over config file
      expect(result.consensus).to.equal('v0.73.0');
    });

    it('accepts versions with or without a leading "v" prefix', async (): Promise<void> => {
      const result: OneShotVersionsObject = await command.resolveOneShotComponentVersions(
        makeArgv({
          [flags.consensusNodeVersion.name]: '0.73.0', // no "v" prefix
          [flags.relayVersion.name]: 'v0.77.0', // with "v" prefix
        }),
        false,
      );
      expect(result.consensus).to.equal('0.73.0');
      expect(result.relay).to.equal('v0.77.0');
    });

    it('accepts prerelease versions with or without a leading "v" prefix', async (): Promise<void> => {
      const result: OneShotVersionsObject = await command.resolveOneShotComponentVersions(
        makeArgv({
          [flags.consensusNodeVersion.name]: 'v0.74.0-rc.5',
          [flags.relayVersion.name]: '0.45.3-alpha.1',
        }),
        false,
      );
      expect(result.consensus).to.equal('v0.74.0-rc.5');
      expect(result.relay).to.equal('0.45.3-alpha.1');
    });

    it('resolves the exact versions from the PR review comment (with and without v prefix)', async (): Promise<void> => {
      // Exact flags from the review comment:
      // --consensus-node-version v0.73.0 --mirror-node-version v0.153.0
      // --block-node-version 0.33.0 --relay-version 0.76.0 --explorer-version 25.0.0
      const resultWithPrefix: OneShotVersionsObject = await command.resolveOneShotComponentVersions(
        makeArgv({
          [flags.consensusNodeVersion.name]: 'v0.73.0',
          [flags.mirrorNodeVersion.name]: 'v0.153.0',
          [flags.relayVersion.name]: '0.76.0',
          [flags.explorerVersion.name]: '25.0.0',
          [flags.blockNodeVersion.name]: '0.33.0',
        }),
        false,
      );
      expect(resultWithPrefix.consensus).to.equal('v0.73.0');
      expect(resultWithPrefix.mirror).to.equal('v0.153.0');
      expect(resultWithPrefix.relay).to.equal('0.76.0');
      expect(resultWithPrefix.explorer).to.equal('25.0.0');
      expect(resultWithPrefix.blockNode).to.equal('0.33.0');

      // Same versions without the v prefix
      const resultNoPrefix: OneShotVersionsObject = await command.resolveOneShotComponentVersions(
        makeArgv({
          [flags.consensusNodeVersion.name]: '0.73.0',
          [flags.mirrorNodeVersion.name]: '0.153.0',
          [flags.relayVersion.name]: '0.76.0',
          [flags.explorerVersion.name]: '25.0.0',
          [flags.blockNodeVersion.name]: '0.33.0',
        }),
        false,
      );
      expect(resultNoPrefix.consensus).to.equal('0.73.0');
      expect(resultNoPrefix.mirror).to.equal('0.153.0');
      expect(resultNoPrefix.relay).to.equal('0.76.0');
      expect(resultNoPrefix.explorer).to.equal('25.0.0');
      expect(resultNoPrefix.blockNode).to.equal('0.33.0');
    });
  });
});
