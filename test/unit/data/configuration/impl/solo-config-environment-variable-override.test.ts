// SPDX-License-Identifier: Apache-2.0

/**
 * Verifies the environment variable naming convention for the layered config system.
 *
 * The config key used by the YAML sources (via FlatKeyMapper) uses camelCase property names
 * joined by dots, e.g. `helmChart.directory`.  The EnvironmentStorageBackend must produce the
 * same keys so that EnvironmentConfigSource can override those YAML values.
 *
 * Forward direction  (list / strip):
 *   env var name  →  Prefix.strip(…, ConfigKeyFormatter)  →  config key
 *
 * Reverse direction  (readBytes / add):
 *   config key  →  Prefix.add(…, EnvironmentKeyFormatter)  →  env var name
 *
 * Both directions must be self-consistent AND the resulting config key must match the key
 * produced by FlatKeyMapper for the SoloConfigSchema class properties.
 *
 * Key finding: camelCase property names require UPPER-KEBAB-CASE within env var segments.
 * For example, `helmChart.directory` maps to `SOLO_HELM-CHART_DIRECTORY`, NOT
 * `SOLO_HELM_CHART_DIRECTORY`.  All-underscore names map to flat dot-case keys that do not
 * correspond to any exposed SoloConfigSchema property.
 */

import {expect} from 'chai';
import {before} from 'mocha';
import {EnvironmentStorageBackend} from '../../../../../src/data/backend/impl/environment-storage-backend.js';
import {EnvironmentConfigSource} from '../../../../../src/data/configuration/impl/environment-config-source.js';
import {ClassToObjectMapper} from '../../../../../src/data/mapper/impl/class-to-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../../src/data/key/config-key-formatter.js';
import {SoloConfigSchema} from '../../../../../src/data/schema/model/solo/solo-config-schema.js';
import {Prefix} from '../../../../../src/data/key/prefix.js';
import {EnvironmentKeyFormatter} from '../../../../../src/data/key/environment-key-formatter.js';
import {EnvironmentAliasRegistry} from '../../../../../src/data/schema/decorators/environment-alias-registry.js';

const mapper: ClassToObjectMapper = new ClassToObjectMapper(ConfigKeyFormatter.instance());

// These tests verify the naming CONVENTION (env var -> config key) with environment aliases disabled,
// so an all-underscore alias registered elsewhere cannot influence the pure-convention assertions.
before((): void => {
  EnvironmentAliasRegistry.resetRootSchemas();
});

// ---------------------------------------------------------------------------
// Helper: save / restore process.env around each test
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Section 1 – Key-strip direction: env var name → stripped config key
// ---------------------------------------------------------------------------
describe('EnvironmentStorageBackend – key stripping (env var → config key)', (): void => {
  it('all-underscore SOLO_HELM_CHART_DIRECTORY strips to flat dot key helm.chart.directory', (): void => {
    const stripped: string = Prefix.strip('SOLO_HELM_CHART_DIRECTORY', 'SOLO');
    expect(stripped).to.equal('helm.chart.directory');
  });

  it('hyphenated SOLO_HELM-CHART_DIRECTORY strips to camelCase key helmChart.directory', (): void => {
    const stripped: string = Prefix.strip('SOLO_HELM-CHART_DIRECTORY', 'SOLO');
    expect(stripped).to.equal('helmChart.directory');
  });

  it('all-underscore SOLO_TSS_READY_MAX_ATTEMPTS strips to flat key tss.ready.max.attempts', (): void => {
    const stripped: string = Prefix.strip('SOLO_TSS_READY_MAX_ATTEMPTS', 'SOLO');
    expect(stripped).to.equal('tss.ready.max.attempts');
  });

  it('hyphenated SOLO_TSS_READY-MAX-ATTEMPTS strips to camelCase key tss.readyMaxAttempts', (): void => {
    const stripped: string = Prefix.strip('SOLO_TSS_READY-MAX-ATTEMPTS', 'SOLO');
    expect(stripped).to.equal('tss.readyMaxAttempts');
  });

  it('all-underscore SOLO_TSS_WRAPS_LIBRARY_DOWNLOAD_URL strips to flat key tss.wraps.library.download.url', (): void => {
    const stripped: string = Prefix.strip('SOLO_TSS_WRAPS_LIBRARY_DOWNLOAD_URL', 'SOLO');
    expect(stripped).to.equal('tss.wraps.library.download.url');
  });

  it('hyphenated SOLO_TSS_WRAPS_LIBRARY-DOWNLOAD-URL strips to camelCase key tss.wraps.libraryDownloadUrl', (): void => {
    const stripped: string = Prefix.strip('SOLO_TSS_WRAPS_LIBRARY-DOWNLOAD-URL', 'SOLO');
    expect(stripped).to.equal('tss.wraps.libraryDownloadUrl');
  });
});

// ---------------------------------------------------------------------------
// Section 2 – Reverse direction: config key → env var name looked up by readBytes
// ---------------------------------------------------------------------------
describe('EnvironmentStorageBackend – readBytes lookup (config key → env var)', (): void => {
  it('readBytes("helmChart.directory") with prefix SOLO looks up SOLO_HELM-CHART_DIRECTORY', (): void => {
    const environmentVariableName: string = Prefix.add(
      'helmChart.directory',
      'SOLO',
      EnvironmentKeyFormatter.instance(),
    );
    expect(environmentVariableName).to.equal('SOLO_HELM-CHART_DIRECTORY');
  });

  it('readBytes("helm.chart.directory") with prefix SOLO looks up SOLO_HELM_CHART_DIRECTORY', (): void => {
    const environmentVariableName: string = Prefix.add(
      'helm.chart.directory',
      'SOLO',
      EnvironmentKeyFormatter.instance(),
    );
    expect(environmentVariableName).to.equal('SOLO_HELM_CHART_DIRECTORY');
  });

  it('readBytes("tss.readyMaxAttempts") with prefix SOLO looks up SOLO_TSS_READY-MAX-ATTEMPTS', (): void => {
    const environmentVariableName: string = Prefix.add(
      'tss.readyMaxAttempts',
      'SOLO',
      EnvironmentKeyFormatter.instance(),
    );
    expect(environmentVariableName).to.equal('SOLO_TSS_READY-MAX-ATTEMPTS');
  });

  it('readBytes("tss.ready.max.attempts") with prefix SOLO looks up SOLO_TSS_READY_MAX_ATTEMPTS', (): void => {
    const environmentVariableName: string = Prefix.add(
      'tss.ready.max.attempts',
      'SOLO',
      EnvironmentKeyFormatter.instance(),
    );
    expect(environmentVariableName).to.equal('SOLO_TSS_READY_MAX_ATTEMPTS');
  });

  it('readBytes("tss.wraps.libraryDownloadUrl") with prefix SOLO looks up SOLO_TSS_WRAPS_LIBRARY-DOWNLOAD-URL', (): void => {
    const environmentVariableName: string = Prefix.add(
      'tss.wraps.libraryDownloadUrl',
      'SOLO',
      EnvironmentKeyFormatter.instance(),
    );
    expect(environmentVariableName).to.equal('SOLO_TSS_WRAPS_LIBRARY-DOWNLOAD-URL');
  });

  it(
    'roundtrip: SOLO_HELM-CHART_DIRECTORY appears as helmChart.directory in list() and is readable',
    withEnvironment({'SOLO_HELM-CHART_DIRECTORY': '/tmp/charts'}, async (): Promise<void> => {
      const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend('SOLO');
      const keys: string[] = await backend.list();
      expect(keys.includes('helmChart.directory'), 'should appear as helmChart.directory').to.be.true;
      const value: string = Buffer.from(await backend.readBytes('helmChart.directory')).toString('utf8');
      expect(value).to.equal('/tmp/charts');
    }),
  );

  it(
    'roundtrip: SOLO_HELM_CHART_DIRECTORY appears as helm.chart.directory, not helmChart.directory',
    withEnvironment({SOLO_HELM_CHART_DIRECTORY: '/tmp/charts'}, async (): Promise<void> => {
      const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend('SOLO');
      const keys: string[] = await backend.list();
      expect(keys.includes('helmChart.directory'), 'should NOT appear as helmChart.directory').to.be.false;
      expect(keys.includes('helm.chart.directory'), 'should appear as helm.chart.directory').to.be.true;
    }),
  );
});

// ---------------------------------------------------------------------------
// Section 3 – EnvironmentConfigSource + SoloConfigSchema end-to-end
// ---------------------------------------------------------------------------
describe('EnvironmentConfigSource + SoloConfigSchema – end-to-end override', (): void => {
  it(
    'SOLO_HELM-CHART_DIRECTORY (hyphenated) overrides helmChart.directory',
    withEnvironment({'SOLO_HELM-CHART_DIRECTORY': '/tmp/solo-charts'}, async (): Promise<void> => {
      const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
      await source.load();
      const schema: SoloConfigSchema = source.asObject(SoloConfigSchema);
      expect(schema?.helmChart?.directory).to.equal('/tmp/solo-charts');
    }),
  );

  it(
    'SOLO_HELM_CHART_DIRECTORY (all-underscore) does NOT override helmChart.directory',
    withEnvironment({SOLO_HELM_CHART_DIRECTORY: '/tmp/solo-charts'}, async (): Promise<void> => {
      const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
      await source.load();
      const schema: SoloConfigSchema = source.asObject(SoloConfigSchema);
      expect(schema?.helmChart?.directory).to.not.equal('/tmp/solo-charts');
    }),
  );

  it(
    'SOLO_TSS_READY-MAX-ATTEMPTS (hyphenated) overrides tss.readyMaxAttempts',
    withEnvironment({'SOLO_TSS_READY-MAX-ATTEMPTS': '99'}, async (): Promise<void> => {
      const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
      await source.load();
      const schema: SoloConfigSchema = source.asObject(SoloConfigSchema);
      expect(schema?.tss?.readyMaxAttempts).to.equal(99);
    }),
  );

  it(
    'SOLO_TSS_READY_MAX_ATTEMPTS (all-underscore) does NOT override tss.readyMaxAttempts',
    withEnvironment({SOLO_TSS_READY_MAX_ATTEMPTS: '99'}, async (): Promise<void> => {
      const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
      await source.load();
      const schema: SoloConfigSchema = source.asObject(SoloConfigSchema);
      expect(schema?.tss?.readyMaxAttempts).to.not.equal(99);
    }),
  );

  it(
    'SOLO_TSS_WRAPS_LIBRARY-DOWNLOAD-URL (hyphenated) overrides tss.wraps.libraryDownloadUrl',
    withEnvironment(
      {'SOLO_TSS_WRAPS_LIBRARY-DOWNLOAD-URL': 'https://example.com/wraps.tar.gz'},
      async (): Promise<void> => {
        const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
        await source.load();
        const schema: SoloConfigSchema = source.asObject(SoloConfigSchema);
        expect(schema?.tss?.wraps?.libraryDownloadUrl).to.equal('https://example.com/wraps.tar.gz');
      },
    ),
  );
});
