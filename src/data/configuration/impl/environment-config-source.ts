// SPDX-License-Identifier: Apache-2.0

import {type ConfigSource} from '../spi/config-source.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {LayeredConfigSource} from './layered-config-source.js';
import {EnvironmentStorageBackend} from '../../backend/impl/environment-storage-backend.js';
import {type Refreshable} from '../spi/refreshable.js';

/**
 * A {@link ConfigSource} that reads configuration data from the environment.
 *
 * <p>
 * Strings are read verbatim from the environment variables.
 * Numbers and booleans are converted from strings using the JSON parser.
 * Objects, arrays of objects, and arrays of primitives are assumed to be stored as serialized JSON strings.
 */
export class EnvironmentConfigSource extends LayeredConfigSource implements ConfigSource, Refreshable {
  public constructor(mapper: ObjectMapper, prefix?: string) {
    super(new EnvironmentStorageBackend(prefix), mapper, prefix);
  }

  public get name(): string {
    return 'EnvironmentConfigSource';
  }

  public get ordinal(): number {
    return 100;
  }

  public async refresh(): Promise<void> {
    await this.load();
  }
}
