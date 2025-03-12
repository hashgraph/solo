// SPDX-License-Identifier: Apache-2.0

import {type Schema} from '../../api/schema.js';
import {LocalConfig} from '../../../model/local/local_config.js';
import {type Version} from '../../../../../business/utils/version.js';
import {type ClassConstructor} from '../../../../../business/utils/class_constructor.type.js';
import {type SchemaMigration} from '../../api/schema_migration.js';

export class LocalConfigSchema implements Schema<LocalConfig> {
  get name(): string {
    return LocalConfig.name;
  }

  get version(): Version<number> {
    return LocalConfig.SCHEMA_VERSION;
  }

  get classCtor(): ClassConstructor<LocalConfig> {
    return LocalConfig;
  }

  get migrations(): SchemaMigration[] {
    return [];
  }

  transform(data: object, sourceVersion?: Version<number>): LocalConfig {
    return undefined;
  }
}
