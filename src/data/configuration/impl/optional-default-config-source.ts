// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import {DefaultConfigSource} from './default-config-source.js';
import {Forest} from '../../key/lexer/forest.js';
import {type SchemaDefinition} from '../../schema/migration/api/schema-definition.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {PathEx} from '../../../business/utils/path-ex.js';

/**
 * A {@link DefaultConfigSource} whose backing file is optional.
 *
 * {@link DefaultConfigSource} throws when its file is absent, which is correct for the bundled
 * resource files that ship with Solo. It is wrong for an operator-editable file such as
 * `~/.solo/solo-config.yaml`: not having one is the normal case, and refreshing the configuration must
 * not fail because the user never created it.
 *
 * When the file is missing the source loads as empty, contributing nothing to the layered
 * cascade, so every value falls through to the layer below exactly as if the source were absent.
 */
export class OptionalDefaultConfigSource<T extends object> extends DefaultConfigSource<T> {
  private readonly filePath: string;

  public constructor(fileName: string, basePath: string, schema: SchemaDefinition<T>, mapper: ObjectMapper) {
    // The backing file is optional, but DefaultConfigSource's backend still validates that basePath
    // itself is a real directory, and a machine that has never run Solo (a fresh CI runner, a new
    // operator's first run) has no reason to have created it yet. Mirrors Container.init()'s own
    // mkdirSync of its home directory, for the same reason.
    fs.mkdirSync(basePath, {recursive: true});
    super(fileName, basePath, schema, mapper);
    this.filePath = PathEx.join(basePath, fileName);
  }

  public override async load(): Promise<void> {
    if (!fs.existsSync(this.filePath)) {
      this.modelData = await this.schema.transform({});
      this.forest = Forest.from(this.mapper.toFlatKeyMap(this.modelData));
      return;
    }
    await super.load();
  }
}
