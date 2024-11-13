/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import { ComponentTypeEnum } from '../enumerations.ts'
import { SoloError } from '../../../errors.ts'
import type { Component } from '../types.ts'

export abstract class BaseComponent implements Component {
  private readonly _type: ComponentTypeEnum
  private readonly _name: string
  private readonly _cluster: string
  private readonly _namespace: string

  protected constructor (type: ComponentTypeEnum, name: string, cluster: string, namespace: string) {
    this._type = type
    this._name = name
    this._cluster = cluster
    this._namespace = namespace
  }

  get type () { return this._type }
  get name () { return this._name }
  get cluster () { return this._cluster }
  get namespace () { return this._namespace }

  protected validate () {
    if (!this.name || typeof this.name !== 'string') {
      throw new SoloError(`Invalid name: ${this.name}`)
    }

    if (!this.cluster || typeof this.cluster !== 'string') {
      throw new SoloError(`Invalid cluster: ${this.cluster}`)
    }

    if (!this.namespace || typeof this.namespace !== 'string') {
      throw new SoloError(`Invalid namespace: ${this.namespace}`)
    }

    if (!Object.values(ComponentTypeEnum).includes(this.type)) {
      throw new SoloError('Invalid ComponentTypeEnum value')
    }
  }

  toObject (): Component {
    return {
      name: this.name,
      cluster: this.cluster,
      namespace: this.namespace,
    }
  }
}
