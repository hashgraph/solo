// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {LocalConfigSource} from '../../../../../src/data/configuration/impl/local-config-source.js';
import {LocalConfigSchema} from '../../../../../src/data/schema/migration/impl/local/local-config-schema.js';
import {type ObjectMapper} from '../../../../../src/data/mapper/api/object-mapper.js';
import {ClassToObjectMapper} from '../../../../../src/data/mapper/impl/class-to-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../../src/data/key/config-key-formatter.js';
import {SimpleObjectStorageBackend} from '../../../fixtures/simple-object-storage-backend.fixture.js';

describe('LocalConfigSource', () => {
  it('constructor with null ObjectMapper throws error', () => {
    expect(() => {
      new LocalConfigSource(null, null, null, null);
    }).to.throw('ObjectMapper is required');
  });

  it('asBoolean with null value returns null', async () => {
    const objectMapper: ObjectMapper = new ClassToObjectMapper(ConfigKeyFormatter.instance());
    const map: Map<string, object> = new Map<string, object>();
    map.set('local-config', {
      schemaVersion: 1,
      deployments: [{name: 'true', namespace: 'false', clusters: ['true', {key: 'value'}, '{"key": "value"}']}],
    });
    const source: LocalConfigSource = new LocalConfigSource(
      'local-config',
      new LocalConfigSchema(objectMapper),
      objectMapper,
      new SimpleObjectStorageBackend(map),
    );
    await source.load();
    expect(source.asBoolean('deployments.0.name')).to.be.true;
    expect(source.asBoolean('deployments.0.namespace')).to.be.false;
    expect(source.asBoolean('deployments.0.clusters.0')).to.be.true;
    expect(source.asBoolean('deployments.0.clusters.1')).to.be.null;
    expect(source.asBoolean('deployments.0.clusters.2')).to.be.true;
  });
});
