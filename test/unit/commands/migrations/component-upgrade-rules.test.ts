// SPDX-License-Identifier: Apache-2.0

import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import fs from 'node:fs';
import {
  ComponentUpgradeMigrationRules,
  type ComponentUpgradeMigrationStep,
} from '../../../../src/commands/migrations/component-upgrade-rules.js';
import * as constants from '../../../../src/core/constants.js';
import sinon from 'sinon';
import {type ComponentUpgradeMigrationConfigFile} from '../../../../src/commands/migrations/component-upgrade-migration-config-file.js';

describe('ComponentUpgradeMigrationRules.planUpgradeMigrationPath', (): void => {
  let existsSyncStub: sinon.SinonStub;
  let readFileSyncStub: sinon.SinonStub;

  beforeEach((): void => {
    ComponentUpgradeMigrationRules.resetCache();
    existsSyncStub = sinon.stub(fs, 'existsSync');
    readFileSyncStub = sinon.stub(fs, 'readFileSync');
    existsSyncStub.callThrough();
    readFileSyncStub.callThrough();
  });

  afterEach((): void => {
    ComponentUpgradeMigrationRules.resetCache();
    sinon.restore();
  });

  describe('same version (no-op upgrade)', (): void => {
    it('returns a single in-place step for same version', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'block-node',
        '0.27.0',
        '0.27.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('in-place');
      expect(steps[0].fromVersion).to.equal('0.27.0');
      expect(steps[0].toVersion).to.equal('0.27.0');
    });
  });

  describe('downgrade (no forward boundary crossing)', (): void => {
    it('returns a single in-place step when downgrading', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'block-node',
        '0.28.1',
        '0.27.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('in-place');
      expect(steps[0].fromVersion).to.equal('0.28.1');
      expect(steps[0].toVersion).to.equal('0.27.0');
    });
  });

  describe('upgrade not crossing a boundary', (): void => {
    it('returns a single in-place step when already past the 0.28.1 boundary', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'block-node',
        '0.28.1',
        '0.29.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('in-place');
      expect(steps[0].fromVersion).to.equal('0.28.1');
      expect(steps[0].toVersion).to.equal('0.29.0');
    });

    it('returns a single in-place step for a larger upgrade already past 0.28.1', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'block-node',
        '0.28.1',
        '0.35.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('in-place');
      expect(steps[0].fromVersion).to.equal('0.28.1');
      expect(steps[0].toVersion).to.equal('0.35.0');
    });
  });

  describe('upgrade crossing the 0.28.1 boundary', (): void => {
    it('returns a single recreate step when upgrading from below to exactly 0.28.1', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'block-node',
        '0.28.0',
        '0.28.1',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].fromVersion).to.equal('0.28.0');
      expect(steps[0].toVersion).to.equal('0.28.1');
    });

    it('returns recreate then in-place steps when crossing 0.28.1 and 0.32.0 boundaries', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'block-node',
        '0.28.0',
        '0.35.0',
      );

      expect(steps).to.have.length(2);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].fromVersion).to.equal('0.28.0');
      expect(steps[0].toVersion).to.equal('0.28.1');
      expect(steps[1].strategy).to.equal('in-place');
      expect(steps[1].fromVersion).to.equal('0.28.1');
      expect(steps[1].toVersion).to.equal('0.35.0');
    });
  });

  describe('upgrade crossing the 0.32.0 boundary', (): void => {
    it('injects migration args to bridge legacy metrics values path', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'block-node',
        '0.31.0',
        '0.33.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('in-place');
      expect(steps[0].fromVersion).to.equal('0.31.0');
      expect(steps[0].toVersion).to.equal('0.33.0');
      expect(steps[0].extraCommandArgs).to.deep.equal([
        '--set',
        'blockNode.metrics.hostname=0.0.0.0',
        '--set',
        'blockNode.metrics.port=16007',
        '--set',
        'blockNode.metrics.path=/metrics',
      ]);
    });
  });

  describe('upgrade crossing the 0.37.0 boundary', (): void => {
    it('returns a recreate step when upgrading from below to 0.37.0', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'block-node',
        '0.36.0',
        '0.37.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].fromVersion).to.equal('0.36.0');
      expect(steps[0].toVersion).to.equal('0.37.0');
      expect(steps[0].reason).to.include('volumeClaimTemplates');
    });

    it('uses the default in-place strategy after the 0.37.0 boundary is already reached', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'block-node',
        '0.37.0',
        '0.37.1',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('in-place');
      expect(steps[0].fromVersion).to.equal('0.37.0');
      expect(steps[0].toVersion).to.equal('0.37.1');
    });
  });

  describe('upgrade crossing a custom boundary', (): void => {
    it('returns a single recreate step when upgrading across a custom recreate boundary', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          'block-node': {
            defaultStrategy: 'in-place',
            boundaries: [{version: '1.0.0', strategy: 'recreate', reason: 'Custom boundary'}],
          },
        },
      };
      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'block-node',
        '0.9.0',
        '1.0.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].fromVersion).to.equal('0.9.0');
      expect(steps[0].toVersion).to.equal('1.0.0');
    });

    it('returns a recreate step going directly to target when crossing a custom boundary', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          'block-node': {
            defaultStrategy: 'in-place',
            boundaries: [{version: '1.0.0', strategy: 'recreate', reason: 'Custom boundary'}],
          },
        },
      };
      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'block-node',
        '0.9.0',
        '1.5.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].fromVersion).to.equal('0.9.0');
      expect(steps[0].toVersion).to.equal('1.5.0');
    });

    it('splits into multiple steps when multiple boundaries with different strategies are crossed', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          'multi-boundary': {
            defaultStrategy: 'in-place',
            boundaries: [
              {version: '2.0.0', strategy: 'recreate', reason: 'Immutable field change at 2.0.0'},
              {version: '3.0.0', strategy: 'in-place', reason: 'Config change at 3.0.0'},
            ],
          },
        },
      };

      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'multi-boundary',
        '1.0.0',
        '4.0.0',
      );

      expect(steps).to.have.length(2);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].fromVersion).to.equal('1.0.0');
      expect(steps[0].toVersion).to.equal('2.0.0');
      expect(steps[1].strategy).to.equal('in-place');
      expect(steps[1].fromVersion).to.equal('2.0.0');
      expect(steps[1].toVersion).to.equal('4.0.0');
    });

    it('merges consecutive boundaries with the same strategy into a single step', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          'merge-test': {
            defaultStrategy: 'in-place',
            boundaries: [
              {version: '2.0.0', strategy: 'recreate', reason: 'First recreate'},
              {version: '3.0.0', strategy: 'recreate', reason: 'Second recreate'},
            ],
          },
        },
      };

      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'merge-test',
        '1.0.0',
        '4.0.0',
      );

      // Both recreate boundaries should merge into a single step jumping to the target
      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].fromVersion).to.equal('1.0.0');
      expect(steps[0].toVersion).to.equal('4.0.0');
    });

    it('handles three alternating-strategy boundaries correctly', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          alternating: {
            defaultStrategy: 'in-place',
            boundaries: [
              {version: '2.0.0', strategy: 'recreate', reason: 'Recreate at 2.0'},
              {version: '3.0.0', strategy: 'in-place', reason: 'In-place at 3.0'},
              {version: '4.0.0', strategy: 'recreate', reason: 'Recreate at 4.0'},
            ],
          },
        },
      };

      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'alternating',
        '1.0.0',
        '5.0.0',
      );

      // 3 distinct strategy segments: recreate → in-place → recreate
      expect(steps).to.have.length(3);
      expect(steps[0]).to.deep.include({fromVersion: '1.0.0', toVersion: '2.0.0', strategy: 'recreate'});
      expect(steps[1]).to.deep.include({fromVersion: '2.0.0', toVersion: '3.0.0', strategy: 'in-place'});
      expect(steps[2]).to.deep.include({fromVersion: '3.0.0', toVersion: '5.0.0', strategy: 'recreate'});
    });

    it('only crosses boundaries within the upgrade range, not all boundaries', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          'partial-cross': {
            defaultStrategy: 'in-place',
            boundaries: [
              {version: '2.0.0', strategy: 'recreate', reason: 'Recreate at 2.0'},
              {version: '5.0.0', strategy: 'recreate', reason: 'Recreate at 5.0'},
            ],
          },
        },
      };

      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      // Upgrading 1.0→3.0 only crosses 2.0, not 5.0
      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'partial-cross',
        '1.0.0',
        '3.0.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].fromVersion).to.equal('1.0.0');
      expect(steps[0].toVersion).to.equal('3.0.0');
    });
  });

  describe('unknown component', (): void => {
    it('returns a single in-place step with default strategy for unknown component', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'unknown-component',
        '1.0.0',
        '2.0.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('in-place');
      expect(steps[0].fromVersion).to.equal('1.0.0');
      expect(steps[0].toVersion).to.equal('2.0.0');
    });
  });

  describe('custom config file override', (): void => {
    it('loads custom config from file and applies its boundary rules', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          'my-component': {
            defaultStrategy: 'in-place',
            boundaries: [
              {
                version: '2.0.0',
                strategy: 'recreate',
                reason: 'Breaking change at 2.0.0',
              },
            ],
          },
        },
      };

      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'my-component',
        '1.0.0',
        '2.0.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].fromVersion).to.equal('1.0.0');
      expect(steps[0].toVersion).to.equal('2.0.0');
    });

    it('falls back to safe empty config if the file has invalid JSON', (): void => {
      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns('not valid json');

      // Falls back to the safe empty config, so the upgrade uses the default in-place strategy.
      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'block-node',
        '0.28.0',
        '0.28.1',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('in-place');
    });

    it('falls back to safe empty config if the file is missing the components field', (): void => {
      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify({notComponents: {}}));

      // Falls back to the safe empty config, so the upgrade uses the default in-place strategy.
      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'block-node',
        '0.28.0',
        '0.28.1',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('in-place');
    });
  });

  describe('step metadata', (): void => {
    it('includes reason text in migration steps', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'block-node',
        '0.28.0',
        '0.28.1',
      );

      expect(steps[0].reason).to.be.a('string').and.not.equal('');
    });

    it('includes extraCommandArgs array in migration steps', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'block-node',
        '0.28.0',
        '0.28.1',
      );

      expect(steps[0].extraCommandArgs).to.be.an('array');
    });

    it('propagates boundary-specific extraCommandArgs to the migration step', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          'args-test': {
            defaultStrategy: 'in-place',
            boundaries: [
              {
                version: '2.0.0',
                strategy: 'recreate',
                reason: 'Breaking change',
                extraCommandArgs: ['--set', 'migration.enabled=true'],
              },
            ],
          },
        },
      };

      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'args-test',
        '1.0.0',
        '3.0.0',
      );

      expect(steps[0].extraCommandArgs).to.deep.equal(['--set', 'migration.enabled=true']);
    });

    it('propagates defaultExtraCommandArgs to default-strategy steps', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          'default-args-test': {
            defaultStrategy: 'in-place',
            defaultExtraCommandArgs: ['--timeout', '600s'],
            boundaries: [],
          },
        },
      };

      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'default-args-test',
        '1.0.0',
        '2.0.0',
      );

      expect(steps[0].extraCommandArgs).to.deep.equal(['--timeout', '600s']);
    });
  });

  describe('version normalization', (): void => {
    it('handles versions with v prefix', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'block-node',
        'v0.28.0',
        'v0.28.1',
      );

      // v0.28.0→v0.28.1 crosses the 0.28.1 recreate boundary after stripping the 'v' prefix
      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].fromVersion).to.equal('0.28.0');
      expect(steps[0].toVersion).to.equal('0.28.1');
    });

    it('handles pre-release versions correctly', (): void => {
      // 0.28.1-rc.1 < 0.28.1 in semver, so the boundary at 0.28.1 is NOT crossed
      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'block-node',
        '0.28.0',
        '0.28.1-rc.1',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('in-place');
    });
  });

  describe('default strategy override', (): void => {
    it('uses recreate as default strategy when configured', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          'recreate-default': {
            defaultStrategy: 'recreate',
            boundaries: [],
          },
        },
      };

      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'recreate-default',
        '1.0.0',
        '2.0.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
    });

    it('uses recreate default strategy for downgrade when configured', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          'recreate-default': {
            defaultStrategy: 'recreate',
            boundaries: [],
          },
        },
      };

      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'recreate-default',
        '2.0.0',
        '1.0.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].reason).to.equal('No forward upgrade boundary crossing detected');
    });
  });

  describe('config caching', (): void => {
    it('caches config after first load and does not re-read file', (): void => {
      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(false);

      // First call loads and caches the default config
      ComponentUpgradeMigrationRules.planUpgradeMigrationPath('block-node', '0.27.0', '0.28.0');
      // Second call should use cached config
      ComponentUpgradeMigrationRules.planUpgradeMigrationPath('block-node', '0.27.0', '0.28.0');

      // existsSync should only be called once for the migration file
      const migrationFileCalls: sinon.SinonSpyCall[] = existsSyncStub
        .getCalls()
        .filter((call: sinon.SinonSpyCall): boolean => call.args[0] === constants.UPGRADE_MIGRATIONS_FILE);
      expect(migrationFileCalls).to.have.length(1);
    });
  });

  describe('downgrade across boundary', (): void => {
    it('does not apply boundary rules when downgrading across a boundary version', (): void => {
      // Downgrading from 0.28.1 to 0.26.0 crosses the 0.28.0 boundary backwards,
      // but boundaries only apply to forward upgrades
      const steps: ComponentUpgradeMigrationStep[] = ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
        'block-node',
        '0.28.1',
        '0.26.0',
      );

      expect(steps).to.have.length(1);
      // Should use default strategy, NOT recreate from the boundary
      expect(steps[0].strategy).to.equal('in-place');
      expect(steps[0].reason).to.equal('No forward upgrade boundary crossing detected');
    });
  });
});
