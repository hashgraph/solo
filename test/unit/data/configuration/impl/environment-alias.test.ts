// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {EnvironmentConfigSource} from '../../../../../src/data/configuration/impl/environment-config-source.js';
import {ClassToObjectMapper} from '../../../../../src/data/mapper/impl/class-to-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../../src/data/key/config-key-formatter.js';
import {SoloConfigSchema} from '../../../../../src/data/schema/model/solo/solo-config-schema.js';
import {EnvironmentAliasRegistry} from '../../../../../src/data/schema/decorators/environment-alias-registry.js';
import {ConfigurationError} from '../../../../../src/data/configuration/api/configuration-error.js';

const mapper: ClassToObjectMapper = new ClassToObjectMapper(ConfigKeyFormatter.instance());

function withEnvironment(variables: Record<string, string>, function_: () => Promise<void>): () => Promise<void> {
  return async (): Promise<void> => {
    const saved: NodeJS.ProcessEnv = {...process.env};
    try {
      for (const [k, v] of Object.entries(variables)) {
        process.env[k] = v;
      }
      await function_();
    } finally {
      for (const k of Object.keys(variables)) {
        if (k in saved) {
          process.env[k] = saved[k];
        } else {
          delete process.env[k];
        }
      }
    }
  };
}

describe('EnvironmentAliasRegistry – alias resolution', (): void => {
  beforeEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
    EnvironmentAliasRegistry.registerRootSchema(SoloConfigSchema);
  });

  afterEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
  });

  it('reconstructs full config paths into canonical stripped keys', (): void => {
    const aliasMap: ReadonlyMap<string, string> = EnvironmentAliasRegistry.aliasMap();
    expect(aliasMap.get('SOLO_TSS_READY_MAX_ATTEMPTS')).to.equal('tss.readyMaxAttempts');
    expect(aliasMap.get('SOLO_TSS_WRAPS_LIBRARY_DOWNLOAD_URL')).to.equal('tss.wraps.libraryDownloadUrl');
  });

  it(
    'a fixed alias sets the field (SOLO_TSS_READY_MAX_ATTEMPTS -> tss.readyMaxAttempts)',
    withEnvironment({SOLO_TSS_READY_MAX_ATTEMPTS: '99'}, async (): Promise<void> => {
      const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
      await source.load();
      const schema: SoloConfigSchema = source.asObject(SoloConfigSchema);
      expect(schema?.tss?.readyMaxAttempts).to.equal(99);
    }),
  );

  it(
    'a nested fixed alias sets the field (SOLO_TSS_WRAPS_LIBRARY_DOWNLOAD_URL -> tss.wraps.libraryDownloadUrl)',
    withEnvironment(
      {SOLO_TSS_WRAPS_LIBRARY_DOWNLOAD_URL: 'https://example.com/wraps.tar.gz'},
      async (): Promise<void> => {
        const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
        await source.load();
        const schema: SoloConfigSchema = source.asObject(SoloConfigSchema);
        expect(schema?.tss?.wraps?.libraryDownloadUrl).to.equal('https://example.com/wraps.tar.gz');
      },
    ),
  );

  it(
    'the generated SOLO_* name wins when both it and the alias are set',
    withEnvironment(
      {'SOLO_TSS_READY-MAX-ATTEMPTS': '5', SOLO_TSS_READY_MAX_ATTEMPTS: '99'},
      async (): Promise<void> => {
        const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
        await source.load();
        const schema: SoloConfigSchema = source.asObject(SoloConfigSchema);
        expect(schema?.tss?.readyMaxAttempts).to.equal(5);
      },
    ),
  );
});

class ReusedLeafSchema {
  @EnvironmentAliasRegistry.alias('DUP_ALIAS_FOR_TEST')
  public value?: string;
}

class ReusedRootSchema {
  public first: ReusedLeafSchema = new ReusedLeafSchema();
  public second: ReusedLeafSchema = new ReusedLeafSchema();
}

describe('EnvironmentAliasRegistry – fail-fast on reused schema types', (): void => {
  afterEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
  });

  it('throws when one alias resolves to more than one config key', (): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
    EnvironmentAliasRegistry.registerRootSchema(ReusedRootSchema);
    expect((): ReadonlyMap<string, string> => EnvironmentAliasRegistry.aliasMap()).to.throw(ConfigurationError);
  });
});
