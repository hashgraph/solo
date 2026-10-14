// SPDX-License-Identifier: Apache-2.0

/**
 * The first suite pins the environment variable contract against fixture schemas that mirror
 * FeatureFlagsSchema's shape — same `featureFlags` property name, hence the same generated env var names —
 * so it keeps testing the mechanism whatever flags come and go. The second pins the real flags.
 * See docs/contributing/feature-flags.md for the contract itself.
 */

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {Exclude, Expose, Type} from 'class-transformer';
import {EnvironmentConfigSource} from '../../../../../src/data/configuration/impl/environment-config-source.js';
import {ClassToObjectMapper} from '../../../../../src/data/mapper/impl/class-to-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../../src/data/key/config-key-formatter.js';
import {EnvironmentAliasRegistry} from '../../../../../src/data/schema/decorators/environment-alias-registry.js';
import {SoloConfigSchema} from '../../../../../src/data/schema/model/solo/solo-config-schema.js';
import {FeatureFlagsSchema} from '../../../../../src/data/schema/model/solo/feature-flags-schema.js';
import {EnvironmentScope} from '../../../../helpers/environment-scope.js';

const mapper: ClassToObjectMapper = new ClassToObjectMapper(ConfigKeyFormatter.instance());

@Exclude()
class FeatureFlagsFixtureSchema {
  @Expose()
  @EnvironmentAliasRegistry.alias('SOLO_FF_STANDARD_FIXTURE_FLAG')
  public standardFixtureFlag: boolean;

  @Expose()
  @EnvironmentAliasRegistry.alias('EXPERIMENTAL_FIXTURE_FLAG')
  public experimentalFixtureFlag: boolean;

  @Expose()
  public defaultOnFixtureFlag: boolean;

  public constructor(standardFixtureFlag?: boolean, experimentalFixtureFlag?: boolean, defaultOnFixtureFlag?: boolean) {
    this.standardFixtureFlag = standardFixtureFlag ?? false;
    this.experimentalFixtureFlag = experimentalFixtureFlag ?? false;
    this.defaultOnFixtureFlag = defaultOnFixtureFlag ?? true;
  }
}

@Exclude()
class FeatureFlagsFixtureConfigSchema {
  @Expose()
  @Type((): typeof FeatureFlagsFixtureSchema => FeatureFlagsFixtureSchema)
  public featureFlags: FeatureFlagsFixtureSchema;

  public constructor(featureFlags?: FeatureFlagsFixtureSchema) {
    this.featureFlags = featureFlags || new FeatureFlagsFixtureSchema();
  }
}

async function readFixtureFlags(): Promise<FeatureFlagsFixtureSchema> {
  const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
  await source.load();
  return source.asObject(FeatureFlagsFixtureConfigSchema)?.featureFlags;
}

async function readSoloFlags(): Promise<FeatureFlagsSchema> {
  const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
  await source.load();
  return source.asObject(SoloConfigSchema)?.featureFlags;
}

describe('feature flags – environment variable overrides', (): void => {
  beforeEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
    EnvironmentAliasRegistry.registerRootSchema(FeatureFlagsFixtureConfigSchema);
  });

  afterEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
  });

  it('maps both aliases onto the featureFlags config path', (): void => {
    const aliasMap: ReadonlyMap<string, string> = EnvironmentAliasRegistry.aliasMap();
    expect(aliasMap.get('SOLO_FF_STANDARD_FIXTURE_FLAG')).to.equal('featureFlags.standardFixtureFlag');
    expect(aliasMap.get('EXPERIMENTAL_FIXTURE_FLAG')).to.equal('featureFlags.experimentalFixtureFlag');
  });

  it(
    'the generated SOLO_FEATURE_FLAGS_* name sets a flag',
    EnvironmentScope.with({SOLO_FEATURE_FLAGS_STANDARD_FIXTURE_FLAG: 'true'}, async (): Promise<void> => {
      const flags: FeatureFlagsFixtureSchema = await readFixtureFlags();
      expect(flags?.standardFixtureFlag).to.be.true;
    }),
  );

  it(
    'the SOLO_FF_* alias sets a standard flag',
    EnvironmentScope.with({SOLO_FF_STANDARD_FIXTURE_FLAG: 'true'}, async (): Promise<void> => {
      const flags: FeatureFlagsFixtureSchema = await readFixtureFlags();
      expect(flags?.standardFixtureFlag).to.be.true;
    }),
  );

  it(
    'the EXPERIMENTAL_* alias sets an experimental flag',
    EnvironmentScope.with({EXPERIMENTAL_FIXTURE_FLAG: 'true'}, async (): Promise<void> => {
      const flags: FeatureFlagsFixtureSchema = await readFixtureFlags();
      expect(flags?.experimentalFixtureFlag).to.be.true;
    }),
  );

  it(
    'the generated name wins when it and the alias disagree',
    EnvironmentScope.with(
      {SOLO_FEATURE_FLAGS_STANDARD_FIXTURE_FLAG: 'false', SOLO_FF_STANDARD_FIXTURE_FLAG: 'true'},
      async (): Promise<void> => {
        const flags: FeatureFlagsFixtureSchema = await readFixtureFlags();
        expect(flags?.standardFixtureFlag).to.be.false;
      },
    ),
  );

  it(
    'an explicit false turns a default-on flag off',
    EnvironmentScope.with({SOLO_FEATURE_FLAGS_DEFAULT_ON_FIXTURE_FLAG: 'false'}, async (): Promise<void> => {
      const flags: FeatureFlagsFixtureSchema = await readFixtureFlags();
      expect(flags?.defaultOnFixtureFlag).to.be.false;
    }),
  );

  it(
    'an alias set to false turns a flag off',
    EnvironmentScope.with({SOLO_FF_STANDARD_FIXTURE_FLAG: 'false'}, async (): Promise<void> => {
      const flags: FeatureFlagsFixtureSchema = await readFixtureFlags();
      expect(flags?.standardFixtureFlag).to.be.false;
    }),
  );
});

describe('feature flags – legacy environment variable names', (): void => {
  beforeEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
    EnvironmentAliasRegistry.registerRootSchema(SoloConfigSchema);
  });

  afterEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
  });

  it(
    'honours the legacy SKIP_NODE_PING name',
    EnvironmentScope.with({SKIP_NODE_PING: 'true'}, async (): Promise<void> => {
      const flags: FeatureFlagsSchema = await readSoloFlags();
      expect(flags?.skipNodePing).to.be.true;
    }),
  );

  it(
    'honours the new SOLO_FF_SKIP_NODE_PING name',
    EnvironmentScope.with({SOLO_FF_SKIP_NODE_PING: 'true'}, async (): Promise<void> => {
      const flags: FeatureFlagsSchema = await readSoloFlags();
      expect(flags?.skipNodePing).to.be.true;
    }),
  );

  it(
    'prefers the new name over the legacy one when both are set',
    EnvironmentScope.with({SOLO_FF_SKIP_NODE_PING: 'true', SKIP_NODE_PING: 'false'}, async (): Promise<void> => {
      const flags: FeatureFlagsSchema = await readSoloFlags();
      expect(flags?.skipNodePing).to.be.true;
    }),
  );

  it(
    "treats SKIP_NODE_PING=false as off, unlike the old Boolean('false') truthiness bug",
    EnvironmentScope.with({SKIP_NODE_PING: 'false'}, async (): Promise<void> => {
      const flags: FeatureFlagsSchema = await readSoloFlags();
      expect(flags?.skipNodePing).to.be.false;
    }),
  );

  it(
    'honours ENABLE_IMAGE_CACHE=false, the way CI sets it',
    EnvironmentScope.with({ENABLE_IMAGE_CACHE: 'false'}, async (): Promise<void> => {
      const flags: FeatureFlagsSchema = await readSoloFlags();
      expect(flags?.enableImageCache).to.be.false;
    }),
  );

  it(
    'honours the legacy DISABLE_IMPORTER_SPRING_PROFILES name used by launch_network.sh and CI',
    EnvironmentScope.with({DISABLE_IMPORTER_SPRING_PROFILES: 'true'}, async (): Promise<void> => {
      const flags: FeatureFlagsSchema = await readSoloFlags();
      expect(flags?.disableBlockNodeIntegration).to.be.true;
    }),
  );

  it(
    'honours EXPERIMENTAL_COPY_WRAPS_LIB_IN_PARALLEL, which keeps its experimental name',
    EnvironmentScope.with({EXPERIMENTAL_COPY_WRAPS_LIB_IN_PARALLEL: 'true'}, async (): Promise<void> => {
      const flags: FeatureFlagsSchema = await readSoloFlags();
      expect(flags?.copyWrapsLibraryInParallel).to.be.true;
    }),
  );
});

describe('feature flags – value parsing', (): void => {
  beforeEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
    EnvironmentAliasRegistry.registerRootSchema(SoloConfigSchema);
  });

  afterEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
  });

  // `equal` is strict, so these also prove the flag is a real boolean rather than the string or number
  // the environment carried.
  for (const [value, expected] of [
    ['true', true],
    ['TRUE', true],
    ['1', true],
    ['false', false],
    ['FALSE', false],
    ['0', false],
    [' True ', true],
  ] as [string, boolean][]) {
    it(
      `reads SKIP_NODE_PING='${value}' as ${expected}`,
      EnvironmentScope.with({SKIP_NODE_PING: value}, async (): Promise<void> => {
        const flags: FeatureFlagsSchema = await readSoloFlags();
        expect(flags?.skipNodePing).to.equal(expected);
      }),
    );
  }

  for (const value of ['no', 'off', '4']) {
    it(
      `rejects ENABLE_IMAGE_CACHE='${value}' instead of reading it as truthy`,
      EnvironmentScope.with({ENABLE_IMAGE_CACHE: value}, async (): Promise<void> => {
        try {
          await readSoloFlags();
          expect.fail('expected a type mismatch error');
        } catch (error) {
          expect(error.message).to.include('ENABLE_IMAGE_CACHE');
          expect(error.message).to.include('not a valid boolean');
        }
      }),
    );
  }

  const blank: string = ' '.repeat(3);

  it(
    'treats a blank value as unset under every spelling, falling back to the default',
    EnvironmentScope.with(
      {SOLO_FEATURE_FLAGS_ENABLE_IMAGE_CACHE: blank, SOLO_FF_ENABLE_IMAGE_CACHE: blank, ENABLE_IMAGE_CACHE: blank},
      async (): Promise<void> => {
        expect(FeatureFlagsSchema.withDefaults(await readSoloFlags()).enableImageCache).to.equal(true);
      },
    ),
  );
});
