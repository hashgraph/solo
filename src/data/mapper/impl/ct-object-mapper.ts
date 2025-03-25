// SPDX-License-Identifier: Apache-2.0

import {type ObjectMapper} from '../api/object-mapper.js';
import {type ClassConstructor} from '../../../business/utils/class-constructor.type.js';
import {instanceToPlain, plainToInstance} from 'class-transformer';
import {ObjectMappingError} from '../api/object-mapping-error.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {type KeyFormatter} from '../../key/key-formatter.js';
import {FlatKeyMapper} from './flat-key-mapper.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import {IllegalArgumentError} from '../../../business/errors/illegal-argument-error.js';
import {type Primitive} from '../../../business/utils/primitive.js';
import {type PrimitiveArray} from '../../../business/utils/primitive-array.js';

@injectable()
export class CTObjectMapper implements ObjectMapper {
  private readonly flatMapper: FlatKeyMapper;

  public constructor(@inject(InjectTokens.KeyFormatter) private readonly formatter: KeyFormatter) {
    this.flatMapper = new FlatKeyMapper(patchInject(formatter, InjectTokens.KeyFormatter, CTObjectMapper.name));
  }

  public fromArray<T extends R, R>(cls: ClassConstructor<T>, arr: object[]): R[] {
    const result: R[] = [];
    for (const item of arr) {
      result.push(this.fromObject(cls, item));
    }
    return result;
  }

  public fromObject<T extends R, R>(cls: ClassConstructor<T>, obj: object): R {
    try {
      return plainToInstance(cls, obj);
    } catch (e) {
      throw new ObjectMappingError(`Error converting object to class instance [ cls = '${cls.name}' ]`, e);
    }
  }

  public toArray<T>(data: T[]): object[] {
    const result: object[] = [];

    for (const item of data) {
      result.push(this.toObject(item));
    }
    return result;
  }

  public toObject<T>(data: T): object {
    try {
      return instanceToPlain(data);
    } catch (e) {
      throw new ObjectMappingError(`Error converting class instance to object [ cls = '${data.constructor.name}' ]`, e);
    }
  }

  public toFlatKeyMap(data: object): Map<string, string> {
    return this.flatMapper.flatten(data);
  }

  public applyPropertyValue(obj: object, key: string, value: Primitive | PrimitiveArray | object | object[]): void {
    if (!obj) {
      throw new IllegalArgumentError('obj must not be null or undefined');
    }

    if (!key) {
      throw new IllegalArgumentError('key must not be null or undefined');
    }

    const normalizedKey: string = this.formatter.normalize(key);
    const components: string[] = this.formatter.split(normalizedKey);

    let currentObj: object = obj;
    for (let i = 0; i < components.length - 1; i++) {
      const keyComponent: string = components[i];

      // If the property is not found, we cannot proceed.
      if (!(keyComponent in currentObj)) {
        throw new ObjectMappingError(`Property not found [ key = '${key}', obj = '${currentObj}' ]`);
      }

      const propertyType = typeof currentObj[keyComponent];

      // If we are  at the end of the key path, then set the property.
      // Otherwise, the property must be an object.
      if (i === components.length - 1) {
        currentObj[keyComponent] = value;
      } else if (propertyType !== 'object') {
        throw new ObjectMappingError(
          `Non-terminal property is not an object [ key = '${key}', propertyType = '${propertyType}' ]`,
        );
      }

      currentObj = currentObj[keyComponent] as object;

      // If the current object is null or undefined, we cannot proceed.
      if (currentObj === undefined || currentObj === null) {
        throw new ObjectMappingError(`Intermediate object must not be null or undefined [ key = '${key}' ]`);
      }
    }
  }
}
