// SPDX-License-Identifier: Apache-2.0

import {type ObjectMapper} from '../api/object-mapper.js';
import {type ClassConstructor} from '../../../business/utils/class-constructor.type.js';
import {instanceToPlain, plainToInstance} from 'class-transformer';
import {ObjectMappingError} from '../api/object-mapping-error.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {type KeyFormatter} from '../../key/key-formatter.js';
import {FlatKeyMapper} from './flat-key-mapper.js';

@injectable()
export class CTObjectMapper implements ObjectMapper {
  private readonly flatMapper: FlatKeyMapper;

  public constructor(@inject(InjectTokens.KeyFormatter) formatter: KeyFormatter) {
    // this.flatMapper = new FlatKeyMapper(patchInject(formatter, InjectTokens.KeyFormatter, CTObjectMapper.name));
    this.flatMapper = new FlatKeyMapper(formatter);
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

  public toFlatKeyMap<T extends object>(data: T): Map<string, string> {
    return this.flatMapper.flatten(data);
  }
}
