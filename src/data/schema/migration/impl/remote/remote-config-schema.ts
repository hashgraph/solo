// SPDX-License-Identifier: Apache-2.0

import {SchemaBase} from '../../api/schema-base.js';
import {type Schema} from '../../api/schema.js';
import {RemoteConfig} from '../../../model/remote/remote-config.js';
import {type ClassConstructor} from '../../../../../business/utils/class-constructor.type.js';
import {type SchemaMigration} from '../../api/schema-migration.js';
import {type Version} from '../../../../../business/utils/version.js';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {type ObjectMapper} from '../../../../mapper/api/object-mapper.js';
import {RemoteConfigV1Migration} from './remote-config-v1-migration.js';
import {inject, injectable} from 'tsyringe-neo';

@injectable()
export class RemoteConfigSchema extends SchemaBase<RemoteConfig> implements Schema<RemoteConfig> {
  public constructor(@inject(InjectTokens.ObjectMapper) mapper: ObjectMapper) {
    super(mapper);
  }

  public get name(): string {
    return RemoteConfig.name;
  }

  public get version(): Version<number> {
    return RemoteConfig.SCHEMA_VERSION;
  }

  public get classCtor(): ClassConstructor<RemoteConfig> {
    return RemoteConfig;
  }

  public get migrations(): SchemaMigration[] {
    return [new RemoteConfigV1Migration()];
  }
}
