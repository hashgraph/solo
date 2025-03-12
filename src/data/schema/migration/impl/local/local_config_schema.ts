// SPDX-License-Identifier: Apache-2.0

import {type Schema} from '../../api/schema.js';
import {LocalConfig} from '../../../model/local/local_config.js';
import {type Version} from '../../../../../business/utils/version.js';
import {type ClassConstructor} from '../../../../../business/utils/class_constructor.type.js';
import {type SchemaMigration} from '../../api/schema_migration.js';
import {injectable} from 'tsyringe-neo';

@injectable()
export class LocalConfigSchema implements Schema<LocalConfig> {
  public constructor() {}

  public get name(): string {
    return LocalConfig.name;
  }

  public get version(): Version<number> {
    return LocalConfig.SCHEMA_VERSION;
  }

  public get classCtor(): ClassConstructor<LocalConfig> {
    return LocalConfig;
  }

  public get migrations(): SchemaMigration[] {
    return [];
  }

  public transform(data: object, sourceVersion?: Version<number>): LocalConfig {
    return undefined;
  }
}
