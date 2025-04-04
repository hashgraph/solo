// SPDX-License-Identifier: Apache-2.0

import {type Schema} from '../../api/schema.js';
import {LocalConfig} from '../../../model/local/local-config.js';
import {type Version} from '../../../../../business/utils/version.js';
import {type ClassConstructor} from '../../../../../business/utils/class-constructor.type.js';
import {type SchemaMigration} from '../../api/schema-migration.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {type ObjectMapper} from '../../../../mapper/api/object-mapper.js';
import {SchemaBase} from '../../api/schema-base.js';
import {LocalConfigV1Migration} from './local-config-v1-migration.js';
import {LocalConfigV2Migration} from './local-config-v2-migration.js';

@injectable()
export class LocalConfigSchema extends SchemaBase<LocalConfig> implements Schema<LocalConfig> {
  public constructor(@inject(InjectTokens.ObjectMapper) mapper: ObjectMapper) {
    super(mapper);
  }

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
    return [new LocalConfigV1Migration(), new LocalConfigV2Migration()];
  }
}
