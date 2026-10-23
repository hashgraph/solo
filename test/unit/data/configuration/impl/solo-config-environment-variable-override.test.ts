// SPDX-License-Identifier: Apache-2.0

/**
 * Verifies the environment variable naming convention for the layered config system.
 *
 * The config key used by the YAML sources (via FlatKeyMapper) uses camelCase property names
 * joined by dots, e.g. `helmChart.directory`.  The EnvironmentStorageBackend must produce the
 * same keys so that EnvironmentConfigSource can override those YAML values.
 *
 * Names are generated from the schema, via Prefix.add / EnvironmentKeyFormatter:
 *   `helmChart.directory`  ->  `SOLO_HELM_CHART_DIRECTORY`
 *
 * `_` separates both nesting levels and camelCase word boundaries, so a name cannot be taken apart
 * again; EnvironmentStorageBackend therefore reads the environment forwards, looking up the name each
 * declared config key generates.  Environment variable names must be POSIX identifiers
 * (`[A-Za-z_][A-Za-z0-9_]*`); a dash cannot appear in one, because
 * `export SOLO_HELM-CHART_DIRECTORY=...` is rejected by every POSIX shell.
 */

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {EnvironmentStorageBackend} from '../../../../../src/data/backend/impl/environment-storage-backend.js';
import {EnvironmentConfigSource} from '../../../../../src/data/configuration/impl/environment-config-source.js';
import {ClassToObjectMapper} from '../../../../../src/data/mapper/impl/class-to-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../../src/data/key/config-key-formatter.js';
import {SoloConfigSchema} from '../../../../../src/data/schema/model/solo/solo-config-schema.js';
import {Prefix} from '../../../../../src/data/key/prefix.js';
import {EnvironmentKeyFormatter} from '../../../../../src/data/key/environment-key-formatter.js';
import {EnvironmentAliasRegistry} from '../../../../../src/data/schema/decorators/environment-alias-registry.js';
import {EnvironmentScope} from '../../../../../test/helpers/environment-scope.js';

const mapper: ClassToObjectMapper = new ClassToObjectMapper(ConfigKeyFormatter.instance());

// Name generation is schema-derived, so SoloConfigSchema has to be the registered root for these
// assertions.  This runs before each test, not once for the file: other suites call resetRootSchemas(),
// and a one-shot `before` would leave the registry empty underneath these assertions.
beforeEach((): void => {
  EnvironmentAliasRegistry.resetRootSchemas();
  EnvironmentAliasRegistry.registerRootSchema(SoloConfigSchema);
});

afterEach((): void => {
  EnvironmentAliasRegistry.resetRootSchemas();
});

// ---------------------------------------------------------------------------
// Section 1 – Forward direction: config key → env var name
// ---------------------------------------------------------------------------
describe('EnvironmentKeyFormatter – env var naming (config key → env var)', (): void => {
  it('renders camelCase word boundaries as underscores, not dashes', (): void => {
    expect(Prefix.add('helmChart.directory', 'SOLO', EnvironmentKeyFormatter.instance())).to.equal(
      'SOLO_HELM_CHART_DIRECTORY',
    );
  });

  it('renders a multi-word leaf as underscores', (): void => {
    expect(Prefix.add('tss.readyMaxAttempts', 'SOLO', EnvironmentKeyFormatter.instance())).to.equal(
      'SOLO_TSS_READY_MAX_ATTEMPTS',
    );
  });

  it('renders a nested multi-word leaf as underscores', (): void => {
    expect(Prefix.add('tss.wraps.libraryDownloadUrl', 'SOLO', EnvironmentKeyFormatter.instance())).to.equal(
      'SOLO_TSS_WRAPS_LIBRARY_DOWNLOAD_URL',
    );
  });

  it('renders a multi-word intermediate segment as underscores', (): void => {
    expect(Prefix.add('ingressControllerHelmChart.version', 'SOLO', EnvironmentKeyFormatter.instance())).to.equal(
      'SOLO_INGRESS_CONTROLLER_HELM_CHART_VERSION',
    );
  });
});

// ---------------------------------------------------------------------------
// Section 2 – Which config keys the environment supplies
// ---------------------------------------------------------------------------
describe('EnvironmentStorageBackend – listing set keys', (): void => {
  it(
    'SOLO_HELM_CHART_DIRECTORY resolves to helmChart.directory',
    EnvironmentScope.with({SOLO_HELM_CHART_DIRECTORY: '/tmp/charts'}, async (): Promise<void> => {
      const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend('SOLO');
      expect(await backend.list()).to.include('helmChart.directory');
    }),
  );

  it(
    'SOLO_TSS_READY_MAX_ATTEMPTS resolves to tss.readyMaxAttempts',
    EnvironmentScope.with({SOLO_TSS_READY_MAX_ATTEMPTS: '99'}, async (): Promise<void> => {
      const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend('SOLO');
      expect(await backend.list()).to.include('tss.readyMaxAttempts');
    }),
  );

  it(
    'SOLO_TSS_WRAPS_LIBRARY_DOWNLOAD_URL resolves to tss.wraps.libraryDownloadUrl',
    EnvironmentScope.with(
      {SOLO_TSS_WRAPS_LIBRARY_DOWNLOAD_URL: 'https://example.com/w.tgz'},
      async (): Promise<void> => {
        const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend('SOLO');
        expect(await backend.list()).to.include('tss.wraps.libraryDownloadUrl');
      },
    ),
  );

  it(
    'roundtrip: the name listed by list() is readable by readBytes()',
    EnvironmentScope.with({SOLO_HELM_CHART_DIRECTORY: '/tmp/charts'}, async (): Promise<void> => {
      const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend('SOLO');
      const value: string = Buffer.from(await backend.readBytes('helmChart.directory')).toString('utf8');
      expect(value).to.equal('/tmp/charts');
    }),
  );
});

// ---------------------------------------------------------------------------
// Section 3 – EnvironmentConfigSource + SoloConfigSchema end-to-end
// ---------------------------------------------------------------------------
describe('EnvironmentConfigSource + SoloConfigSchema – end-to-end override', (): void => {
  it(
    'SOLO_HELM_CHART_DIRECTORY overrides helmChart.directory',
    EnvironmentScope.with({SOLO_HELM_CHART_DIRECTORY: '/tmp/solo-charts'}, async (): Promise<void> => {
      const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
      await source.load();
      const schema: SoloConfigSchema = source.asObject(SoloConfigSchema);
      expect(schema?.helmChart?.directory).to.equal('/tmp/solo-charts');
    }),
  );

  it(
    'SOLO_TSS_READY_MAX_ATTEMPTS overrides tss.readyMaxAttempts',
    EnvironmentScope.with({SOLO_TSS_READY_MAX_ATTEMPTS: '99'}, async (): Promise<void> => {
      const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
      await source.load();
      const schema: SoloConfigSchema = source.asObject(SoloConfigSchema);
      expect(schema?.tss?.readyMaxAttempts).to.equal(99);
    }),
  );

  it(
    'SOLO_TSS_WRAPS_LIBRARY_DOWNLOAD_URL overrides tss.wraps.libraryDownloadUrl',
    EnvironmentScope.with(
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
    'SOLO_INGRESS_CONTROLLER_HELM_CHART_VERSION overrides ingressControllerHelmChart.version',
    EnvironmentScope.with({SOLO_INGRESS_CONTROLLER_HELM_CHART_VERSION: '9.9.9'}, async (): Promise<void> => {
      const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
      await source.load();
      const schema: SoloConfigSchema = source.asObject(SoloConfigSchema);
      expect(schema?.ingressControllerHelmChart?.version).to.equal('9.9.9');
    }),
  );
});

// ---------------------------------------------------------------------------
// Section 4 – Backwards compatibility for the names that used to need an alias
// ---------------------------------------------------------------------------
//
// These four carried an @EnvironmentAliasRegistry.alias(...) while the generated name was hyphenated.
// Once generation switched to UPPER_SNAKE the alias became the generated name itself, so the decorators
// were dropped. The variables must keep working — now via the generated path rather than the alias path.
describe('EnvironmentConfigSource – names that no longer need an alias still resolve', (): void => {
  it(
    'SOLO_TSS_TIMEOUT_AFTER_READY_SECONDS still sets tss.timeoutAfterReadySeconds',
    EnvironmentScope.with({SOLO_TSS_TIMEOUT_AFTER_READY_SECONDS: '42'}, async (): Promise<void> => {
      const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
      await source.load();
      expect(source.asObject(SoloConfigSchema)?.tss?.timeoutAfterReadySeconds).to.equal(42);
    }),
  );

  it(
    'SOLO_TSS_READY_MAX_ATTEMPTS still sets tss.readyMaxAttempts',
    EnvironmentScope.with({SOLO_TSS_READY_MAX_ATTEMPTS: '42'}, async (): Promise<void> => {
      const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
      await source.load();
      expect(source.asObject(SoloConfigSchema)?.tss?.readyMaxAttempts).to.equal(42);
    }),
  );

  it(
    'SOLO_TSS_READY_BACKOFF_SECONDS still sets tss.readyBackoffSeconds',
    EnvironmentScope.with({SOLO_TSS_READY_BACKOFF_SECONDS: '42'}, async (): Promise<void> => {
      const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
      await source.load();
      expect(source.asObject(SoloConfigSchema)?.tss?.readyBackoffSeconds).to.equal(42);
    }),
  );

  it(
    'SOLO_TSS_WRAPS_LIBRARY_DOWNLOAD_URL still sets tss.wraps.libraryDownloadUrl',
    EnvironmentScope.with(
      {SOLO_TSS_WRAPS_LIBRARY_DOWNLOAD_URL: 'https://example.com/w.tgz'},
      async (): Promise<void> => {
        const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
        await source.load();
        expect(source.asObject(SoloConfigSchema)?.tss?.wraps?.libraryDownloadUrl).to.equal('https://example.com/w.tgz');
      },
    ),
  );
});

describe('EnvironmentConfigSource – a numeric field holds a number after load', (): void => {
  // Regression (PR #6021 review): class-transformer does no type conversion, so an override reached
  // tss.readyMaxAttempts as the string it was typed as. '0 < "abc"' is false, which silently reduced the
  // TSS ready wait to zero attempts.
  it(
    'keeps a numeric override a number',
    EnvironmentScope.with({SOLO_TSS_READY_MAX_ATTEMPTS: '99'}, async (): Promise<void> => {
      const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
      await source.load();
      expect(source.asObject(SoloConfigSchema)?.tss?.readyMaxAttempts).to.be.a('number');
    }),
  );

  it(
    'rejects a numeric override that is not a number',
    EnvironmentScope.with({SOLO_TSS_READY_MAX_ATTEMPTS: 'abc'}, async (): Promise<void> => {
      const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
      try {
        await source.load();
        expect.fail('expected a type mismatch error');
      } catch (error) {
        expect(error.message).to.include('SOLO_TSS_READY_MAX_ATTEMPTS');
        expect(error.message).to.include('not a valid number');
      }
    }),
  );
});
