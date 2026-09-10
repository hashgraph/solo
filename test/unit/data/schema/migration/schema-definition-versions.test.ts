// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {type ClassConstructor} from '../../../../../src/business/utils/class-constructor.type.js';
import {SemanticVersion} from '../../../../../src/business/utils/semantic-version.js';
import {VersionRange} from '../../../../../src/business/utils/version-range.js';
import {type ObjectMapper} from '../../../../../src/data/mapper/api/object-mapper.js';
import {SchemaDefinitionBase} from '../../../../../src/data/schema/migration/api/schema-definition-base.js';
import {type SchemaDefinition} from '../../../../../src/data/schema/migration/api/schema-definition.js';
import {type SchemaMigration} from '../../../../../src/data/schema/migration/api/schema-migration.js';
import {SchemaValidationError} from '../../../../../src/data/schema/migration/api/schema-validation-error.js';
import {LocalConfigSchemaDefinition} from '../../../../../src/data/schema/migration/impl/local/local-config-schema-definition.js';
import {RemoteConfigSchemaDefinition} from '../../../../../src/data/schema/migration/impl/remote/remote-config-schema-definition.js';
import {SoloConfigSchemaDefinition} from '../../../../../src/data/schema/migration/impl/solo/solo-config-schema-definition.js';

/**
 * A no-op migration which reports an arbitrary resulting schema version. Used to prove that the declared schema
 * version guard actually fires.
 */
class FakeMigration implements SchemaMigration {
  public constructor(private readonly resultingVersion: number) {}

  public get range(): VersionRange<number> {
    return VersionRange.fromIntegerVersion(this.resultingVersion - 1);
  }

  public get version(): SemanticVersion<number> {
    return new SemanticVersion<number>(this.resultingVersion);
  }

  public async migrate(source: object): Promise<object> {
    return source;
  }
}

/**
 * A schema definition whose declared version and migration list are supplied by the test.
 */
class FakeSchemaDefinition extends SchemaDefinitionBase<object> {
  public constructor(
    private readonly declaredVersion: number,
    private readonly declaredMigrations: SchemaMigration[],
  ) {
    // The mapper is only consulted by transform(), which these tests never exercise.
    super({} as ObjectMapper);
  }

  public get name(): string {
    return 'FakeConfigSchema';
  }

  public get version(): SemanticVersion<number> {
    return new SemanticVersion<number>(this.declaredVersion);
  }

  public get classConstructor(): ClassConstructor<object> {
    return Object as ClassConstructor<object>;
  }

  public get migrations(): SchemaMigration[] {
    return this.declaredMigrations;
  }
}

describe('Schema definition versions', (): void => {
  // The mapper is only consulted by transform(), which these tests never exercise.
  const objectMapper: ObjectMapper = {} as ObjectMapper;

  const definitions: Array<{fileName: string; definition: SchemaDefinition<unknown>}> = [
    {fileName: 'local-config-schema-definition.ts', definition: new LocalConfigSchemaDefinition(objectMapper)},
    {fileName: 'remote-config-schema-definition.ts', definition: new RemoteConfigSchemaDefinition(objectMapper)},
    {fileName: 'solo-config-schema-definition.ts', definition: new SoloConfigSchemaDefinition(objectMapper)},
  ];

  const newestMigrationVersion: (definition: SchemaDefinition<unknown>) => SemanticVersion<number> = (
    definition: SchemaDefinition<unknown>,
  ): SemanticVersion<number> => {
    let newest: SemanticVersion<number> = new SemanticVersion<number>(0);

    for (const migration of definition.migrations) {
      if (migration.version.greaterThan(newest)) {
        newest = migration.version;
      }
    }

    return newest;
  };

  it('covers every versioned configuration schema definition', (): void => {
    const directoryName: string = path.dirname(fileURLToPath(import.meta.url));
    const definitionsPath: string = path.resolve(directoryName, '../../../../../src/data/schema/migration/impl');
    const discoveredFileNames: string[] = fs
      .readdirSync(definitionsPath, {recursive: true})
      .map((entry: string | Buffer): string => path.basename(entry.toString()))
      .filter((fileName: string): boolean => fileName.endsWith('-schema-definition.ts'));
    discoveredFileNames.sort((left: string, right: string): number => left.localeCompare(right));

    const coveredFileNames: string[] = definitions.map(
      (entry: {fileName: string; definition: SchemaDefinition<unknown>}): string => entry.fileName,
    );
    coveredFileNames.sort((left: string, right: string): number => left.localeCompare(right));

    expect(
      coveredFileNames,
      'every versioned configuration schema definition must be listed in this test so that its declared schema ' +
        'version is validated against its migrations',
    ).to.deep.equal(discoveredFileNames);
  });

  for (const {definition} of definitions) {
    describe(definition.name, (): void => {
      it('declares a schema version which is not older than its newest migration', (): void => {
        const newestVersion: SemanticVersion<number> = newestMigrationVersion(definition);

        expect(
          newestVersion.lessThanOrEqual(definition.version),
          `${definition.name} registers a migration producing version '${newestVersion.major}' but declares schema ` +
            `version '${definition.version.major}'; the declared schema version must be bumped alongside the migration`,
        ).to.equal(true);
      });

      it('has an unbroken migration sequence', async (): Promise<void> => {
        await definition.validateMigrations();
      });
    });
  }

  describe('validateMigrations', (): void => {
    it('rejects a migration which is newer than the declared schema version', async (): Promise<void> => {
      const definition: FakeSchemaDefinition = new FakeSchemaDefinition(1, [
        new FakeMigration(1),
        new FakeMigration(2),
      ]);

      await expect(definition.validateMigrations()).to.be.rejectedWith(
        SchemaValidationError,
        "Migration version '2' is newer than the declared schema version '1'",
      );
    });

    it('accepts a migration sequence which reaches the declared schema version', async (): Promise<void> => {
      const definition: FakeSchemaDefinition = new FakeSchemaDefinition(2, [
        new FakeMigration(1),
        new FakeMigration(2),
      ]);

      await expect(definition.validateMigrations()).to.be.fulfilled;
    });

    it('rejects a duplicated migration version', async (): Promise<void> => {
      const definition: FakeSchemaDefinition = new FakeSchemaDefinition(2, [
        new FakeMigration(1),
        new FakeMigration(2),
        new FakeMigration(2),
      ]);

      await expect(definition.validateMigrations()).to.be.rejectedWith(
        SchemaValidationError,
        "Duplicate migration version '2'",
      );
    });

    it('rejects a gap in the migration sequence', async (): Promise<void> => {
      const definition: FakeSchemaDefinition = new FakeSchemaDefinition(3, [
        new FakeMigration(1),
        new FakeMigration(3),
      ]);

      await expect(definition.validateMigrations()).to.be.rejectedWith(SchemaValidationError);
    });
  });
});
