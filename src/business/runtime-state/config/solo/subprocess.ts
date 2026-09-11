// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../../facade/facade.js';
import {type SubprocessSchema} from '../../../../data/schema/model/solo/subprocess-schema.js';
import {type AdditionalEnvironmentVariablesSchema} from '../../../../data/schema/model/solo/additional-environment-variables-schema.js';

export class Subprocess implements Facade<SubprocessSchema> {
  public constructor(public readonly encapsulatedObject: SubprocessSchema) {}

  public get additionalEnvironmentVariables(): AdditionalEnvironmentVariablesSchema {
    return this.encapsulatedObject.additionalEnvironmentVariables;
  }
}
