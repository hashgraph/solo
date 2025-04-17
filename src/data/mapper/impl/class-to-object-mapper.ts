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
export class ClassToObjectMapper implements ObjectMapper {
  private readonly flatMapper: FlatKeyMapper;

  public constructor(@inject(InjectTokens.KeyFormatter) private readonly formatter: KeyFormatter) {
    this.flatMapper = new FlatKeyMapper(patchInject(formatter, InjectTokens.KeyFormatter, ClassToObjectMapper.name));
  }

  public fromArray<T extends R, R>(cls: ClassConstructor<T>, array: object[]): R[] {
    const result: R[] = [];
    for (const item of array) {
      result.push(this.fromObject(cls, item));
    }
    return result;
  }

  public fromObject<T extends R, R>(cls: ClassConstructor<T>, object: object): R {
    try {
      return plainToInstance(cls, object);
    } catch (error) {
      throw new ObjectMappingError(`Error converting object to class instance [ cls = '${cls.name}' ]`, error);
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
    } catch (error) {
      throw new ObjectMappingError(
        `Error converting class instance to object [ cls = '${data.constructor.name}' ]`,
        error,
      );
    }
  }

  public toFlatKeyMap(data: object): Map<string, string> {
    return this.flatMapper.flatten(data);
  }

  public applyPropertyValue(object: object, key: string, value: Primitive | PrimitiveArray | object | object[]): void {
    if (!object) {
      throw new IllegalArgumentError('obj must not be null or undefined');
    }

    if (!key) {
      throw new IllegalArgumentError('key must not be null or undefined');
    }

    const normalizedKey: string = this.formatter.normalize(key);
    const components: string[] = this.formatter.split(normalizedKey);

    let currentObject: object = object;
    for (let index = 0; index < components.length - 1; index++) {
      const keyComponent: string = components[index];

      // If the property is not found, we cannot proceed.
      if (!(keyComponent in currentObject)) {
        throw new ObjectMappingError(`Property not found [ key = '${key}', obj = '${currentObject}' ]`);
      }

      const propertyType = typeof currentObject[keyComponent];

      // If we are at the end of the key path, then set the property.
      // Otherwise, the property must be an object.
      if (index === components.length - 1) {
        currentObject[keyComponent] = value;
      } else if (propertyType !== 'object' || Array.isArray(currentObject[keyComponent])) {
        throw new ObjectMappingError(
          `Non-terminal property is not an object [ key = '${key}', propertyType = '${propertyType}' ]`,
        );
      }

      currentObject = currentObject[keyComponent] as object;

      // If the current object is null or undefined, we cannot proceed.
      if (currentObject === undefined || currentObject === null) {
        throw new ObjectMappingError(`Intermediate object must not be null or undefined [ key = '${key}' ]`);
      }
    }
  }
}
