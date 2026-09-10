// SPDX-License-Identifier: Apache-2.0

import {RemoteConfigSchemaDefinition} from '../../../../../../../src/data/schema/migration/impl/remote/remote-config-schema-definition.js';
import {RemoteConfigV1Migration} from '../../../../../../../src/data/schema/migration/impl/remote/remote-config-v1-migration.js';
import {type ObjectMapper} from '../../../../../../../src/data/mapper/api/object-mapper.js';
import {expect} from 'chai';
import {RemoteConfigSchema} from '../../../../../../../src/data/schema/model/remote/remote-config-schema.js';
import {type SchemaMigration} from '../../../../../../../src/data/schema/migration/api/schema-migration.js';

describe('RemoteConfigSchema', (): void => {
  let objectMapper: ObjectMapper;

  beforeEach((): void => {
    // Mock ObjectMapper (can be a simple object as long as it's not used in logic)
    objectMapper = {} as ObjectMapper;
  });

  it('should instantiate without error', (): void => {
    expect((): RemoteConfigSchemaDefinition => new RemoteConfigSchemaDefinition(objectMapper)).not.to.throw();
  });

  it('should return the correct name', (): void => {
    const schema: RemoteConfigSchemaDefinition = new RemoteConfigSchemaDefinition(objectMapper);
    expect(schema.name).to.be.equal('RemoteConfigSchema');
  });

  it('should return the correct version', (): void => {
    const schema: RemoteConfigSchemaDefinition = new RemoteConfigSchemaDefinition(objectMapper);
    expect(schema.version).equal(RemoteConfigSchema.SCHEMA_VERSION);
  });

  it('should return the correct classConstructor', (): void => {
    const schema: RemoteConfigSchemaDefinition = new RemoteConfigSchemaDefinition(objectMapper);
    expect(schema.classConstructor).equal(RemoteConfigSchema);
  });

  it('should return a migrations array containing RemoteConfigV1Migration', (): void => {
    const schema: RemoteConfigSchemaDefinition = new RemoteConfigSchemaDefinition(objectMapper);
    const migrations: SchemaMigration[] = schema.migrations;
    expect(Array.isArray(migrations)).equal(true);
    expect(migrations.length).equal(8);
    expect(migrations[0]).instanceOf(RemoteConfigV1Migration);
  });

  it('should report the highest migration target as the latest supported version', (): void => {
    const schema: RemoteConfigSchemaDefinition = new RemoteConfigSchemaDefinition(objectMapper);
    expect(schema.latestSupportedVersion.major).equal(8);
  });
});
