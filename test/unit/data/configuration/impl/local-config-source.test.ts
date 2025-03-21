// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {LocalConfigSource} from '../../../../../src/data/configuration/impl/local-config-source.js';
import {LocalConfigSchema} from '../../../../../src/data/schema/migration/impl/local/local-config-schema.js';
import {type ObjectMapper} from '../../../../../src/data/mapper/api/object-mapper.js';
import {CTObjectMapper} from '../../../../../src/data/mapper/impl/ct-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../../src/data/key/config-key-formatter.js';
import {SimpleObjectStorageBackend} from '../../../fixtures/simple-object-storage-backend.fixture.js';

describe('LocalConfigSource', () => {
  it('constructor with null ObjectMapper throws error', () => {
    expect(() => {
      new LocalConfigSource(null, null, null, null);
    }).to.throw('ObjectMapper is required');
  });

  it('asBoolean with null value returns null', async () => {
    const objectMapper: ObjectMapper = new CTObjectMapper(ConfigKeyFormatter.instance());
    const map: Map<string, object> = new Map<string, object>();
    map.set('key', {local: {key: 'fred'}});
    const source: LocalConfigSource = new LocalConfigSource(
      'key',
      new LocalConfigSchema(objectMapper),
      objectMapper,
      new SimpleObjectStorageBackend(map),
    );
    await source.load();
    expect(source.asBoolean('useridentity')).to.be.null;
    expect(source.asBoolean('useridentity.hostname')).to.be.false;
  });
});
