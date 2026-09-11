// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import os from 'node:os';
import {expect} from 'chai';
import {describe, it, afterEach} from 'mocha';
import {OptionalDefaultConfigSource} from '../../../../../src/data/configuration/impl/optional-default-config-source.js';
import {SoloConfigSchemaDefinition} from '../../../../../src/data/schema/migration/impl/solo/solo-config-schema-definition.js';
import {type SoloConfigSchema} from '../../../../../src/data/schema/model/solo/solo-config-schema.js';
import {type ObjectMapper} from '../../../../../src/data/mapper/api/object-mapper.js';
import {ClassToObjectMapper} from '../../../../../src/data/mapper/impl/class-to-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../../src/data/key/config-key-formatter.js';
import {PathEx} from '../../../../../src/business/utils/path-ex.js';

describe('OptionalDefaultConfigSource', (): void => {
  let temporaryDirectory: string;

  afterEach((): void => {
    if (temporaryDirectory) {
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    }
  });

  it('creates its own basePath directory instead of requiring another component to have created it first', async (): Promise<void> => {
    const parentDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-optional-config-source-'));
    temporaryDirectory = parentDirectory;
    const basePath: string = PathEx.join(parentDirectory, 'never-created-yet', '.solo');
    expect(fs.existsSync(basePath), 'precondition: basePath must not already exist').to.equal(false);

    const objectMapper: ObjectMapper = new ClassToObjectMapper(ConfigKeyFormatter.instance());
    const source: OptionalDefaultConfigSource<SoloConfigSchema> = new OptionalDefaultConfigSource<SoloConfigSchema>(
      'solo-config.yaml',
      basePath,
      new SoloConfigSchemaDefinition(objectMapper),
      objectMapper,
    );

    expect(fs.existsSync(basePath), 'constructor must create the missing basePath directory').to.equal(true);

    await source.load();
  });

  it('does not fail when the basePath directory already exists', async (): Promise<void> => {
    const basePath: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-optional-config-source-'));
    temporaryDirectory = basePath;

    const objectMapper: ObjectMapper = new ClassToObjectMapper(ConfigKeyFormatter.instance());

    expect((): void => {
      new OptionalDefaultConfigSource<SoloConfigSchema>(
        'solo-config.yaml',
        basePath,
        new SoloConfigSchemaDefinition(objectMapper),
        objectMapper,
      );
    }).to.not.throw();
  });
});
