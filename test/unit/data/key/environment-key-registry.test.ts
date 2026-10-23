// SPDX-License-Identifier: Apache-2.0

/**
 * Guard suite for the environment variable naming contract.
 *
 * A POSIX environment variable name must match `[A-Za-z_][A-Za-z0-9_]*`. A name containing a dash cannot
 * be set with `export` in any POSIX shell — `export SOLO_HELM-CHART_DIRECTORY=x` fails with
 * "not a valid identifier" — so such a name is unusable however the config system chooses to read it.
 *
 * These tests fail the build if a schema field, or a declared environment alias, reintroduces one.
 */

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {EnvironmentAliasRegistry} from '../../../../src/data/schema/decorators/environment-alias-registry.js';
import {EnvironmentKeyFormatter} from '../../../../src/data/key/environment-key-formatter.js';
import {EnvironmentKeyRegistry} from '../../../../src/data/key/environment-key-registry.js';
import {SoloConfigSchema} from '../../../../src/data/schema/model/solo/solo-config-schema.js';
import {Prefix} from '../../../../src/data/key/prefix.js';

/** Matches a name that is a valid POSIX environment variable identifier. */
const POSIX_NAME: RegExp = /^[A-Za-z_][A-Za-z0-9_]*$/;

describe('environment variable naming contract', (): void => {
  beforeEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
    EnvironmentAliasRegistry.registerRootSchema(SoloConfigSchema);
  });

  afterEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
  });

  it('exposes at least one config path, so the assertions below are not vacuous', (): void => {
    expect(EnvironmentAliasRegistry.configLeaves().size).to.be.greaterThan(0);
  });

  it('generates no environment variable name containing a dash', (): void => {
    const offenders: string[] = [];
    for (const path of EnvironmentAliasRegistry.configLeaves().keys()) {
      const name: string = Prefix.add(path, 'SOLO', EnvironmentKeyFormatter.instance());
      if (name.includes('-')) {
        offenders.push(`${path} -> ${name}`);
      }
    }

    expect(offenders, `config keys generating a dashed environment variable name:\n${offenders.join('\n')}`).to.be
      .empty;
  });

  it('generates only POSIX-valid environment variable names', (): void => {
    const offenders: string[] = [];
    for (const path of EnvironmentAliasRegistry.configLeaves().keys()) {
      const name: string = Prefix.add(path, 'SOLO', EnvironmentKeyFormatter.instance());
      if (!POSIX_NAME.test(name)) {
        offenders.push(`${path} -> ${name}`);
      }
    }

    expect(offenders, `config keys generating a non-POSIX environment variable name:\n${offenders.join('\n')}`).to.be
      .empty;
  });

  it('declares no environment alias containing a dash', (): void => {
    const offenders: string[] = [...EnvironmentAliasRegistry.aliasMap().keys()].filter(
      (name: string): boolean => !POSIX_NAME.test(name),
    );

    expect(offenders, `aliases that are not valid POSIX names:\n${offenders.join('\n')}`).to.be.empty;
  });

  it('declares no alias that merely repeats its own generated name', (): void => {
    // Such an alias is dead weight, and EnvironmentConfigSource logs a misleading "is ignored because the
    // generated name ... takes precedence" warning for it on every run that sets the variable.
    const offenders: string[] = [];
    for (const [alias, path] of EnvironmentAliasRegistry.aliasMap()) {
      if (alias === Prefix.add(path, 'SOLO', EnvironmentKeyFormatter.instance())) {
        offenders.push(`${alias} (on ${path})`);
      }
    }

    expect(offenders, `redundant aliases, drop them:\n${offenders.join('\n')}`).to.be.empty;
  });

  it('classifies each alias as supported or legacy', (): void => {
    expect(EnvironmentAliasRegistry.isLegacy('SKIP_NODE_PING'), 'ad-hoc predecessor is legacy').to.be.true;
    expect(EnvironmentAliasRegistry.isLegacy('ENABLE_IMAGE_CACHE'), 'ad-hoc predecessor is legacy').to.be.true;
    expect(EnvironmentAliasRegistry.isLegacy('DISABLE_IMPORTER_SPRING_PROFILES'), 'ad-hoc predecessor is legacy').to.be
      .true;

    expect(EnvironmentAliasRegistry.isLegacy('SOLO_FF_SKIP_NODE_PING'), 'short form is supported').to.be.false;
    expect(
      EnvironmentAliasRegistry.isLegacy('EXPERIMENTAL_COPY_WRAPS_LIB_IN_PARALLEL'),
      'experimental name is supported',
    ).to.be.false;
  });

  it('keeps both decorators on one field rather than the later clobbering the earlier', (): void => {
    const aliasMap: ReadonlyMap<string, string> = EnvironmentAliasRegistry.aliasMap();
    expect(aliasMap.get('SOLO_FF_SKIP_NODE_PING')).to.equal('featureFlags.skipNodePing');
    expect(aliasMap.get('SKIP_NODE_PING')).to.equal('featureFlags.skipNodePing');
  });

  it('maps every config key to a distinct environment variable name', (): void => {
    // keyMap() throws on collision; asserting the size proves nothing was silently dropped.
    expect(EnvironmentKeyRegistry.keyMap().size).to.equal(EnvironmentAliasRegistry.configLeaves().size);
  });

  it('declares no config key whose first segment is the prefix itself', (): void => {
    // Prefix.add skips the prefix when the normalized key already starts with it, so a key such as
    // `solo.cacheDir` would be read from SOLO_CACHE_DIR — the same variable as a plain `cacheDir`.
    // keyMap() compares unprefixed names and would see those two as distinct, so this is the only
    // place the clash can be caught. No such key exists today; this fails the build if one is added.
    const offenders: string[] = [];
    for (const path of EnvironmentAliasRegistry.configLeaves().keys()) {
      if (path.split('.', 1)[0].toUpperCase() === 'SOLO') {
        offenders.push(`${path} -> ${Prefix.add(path, 'SOLO', EnvironmentKeyFormatter.instance())}`);
      }
    }

    expect(offenders, `config keys that collide with the SOLO prefix, rename them:\n${offenders.join('\n')}`).to.be
      .empty;
  });

  it('generates a distinct name for every config key it declares', (): void => {
    for (const path of EnvironmentAliasRegistry.configLeaves().keys()) {
      const name: string = EnvironmentKeyFormatter.instance().normalize(path);
      expect(EnvironmentKeyRegistry.keyMap().get(name), `${name} should resolve to ${path}`).to.equal(path);
    }
  });
});
