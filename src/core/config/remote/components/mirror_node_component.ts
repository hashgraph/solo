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
import { ComponentTypeEnum } from '../enumerations.js'
import { BaseComponent } from './base_component.js'
import type { Component } from '../types.js'

export class MirrorNodeComponent extends BaseComponent {
  public constructor (name: string, cluster: string, namespace: string) {
    super(ComponentTypeEnum.MirrorNode, name, cluster, namespace)
    this.validate()
  }

  /* -------- Utilities -------- */

  /** Handles creating instance of the class from plain object. */
  public static fromObject (component: Component): MirrorNodeComponent {
    const { name, cluster, namespace } = component
    return new MirrorNodeComponent(name, cluster, namespace)
  }
}
