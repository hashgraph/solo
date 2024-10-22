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

import { type ListrTaskWrapper } from 'listr2'
import { type PromptFunction, Prompts } from './prompt.js'

// export interface IFlag {
//   get constName(): string
//
//   get name(): string
//
//   get definition(): IDefinition
//
//   get prompt(): Function
// }
//
// export interface IDefinition {
//   get describe(): string
//
//   get defaultValue(): any
//
//   get type(): string
// }
//
// export class Definition implements IDefinition {
//   readonly describe: string
//   readonly defaultValue: any
//   readonly type: string
//   readonly disablePrompt: boolean
//
//   constructor (describe: string, defaultValue: any, type: string, disablePrompt: boolean) {
//     this.describe = describe
//     this.defaultValue = defaultValue
//     this.type = type
//     this.disablePrompt = disablePrompt
//   }
// }

export class Definition {
  static readonly describe: string
  static readonly defaultValue: any
  static readonly type: string
  readonly disablePrompt: boolean

  constructor (describe: string, defaultValue: any, type: string, disablePrompt: boolean) {
    this.describe = describe
    this.defaultValue = defaultValue
    this.type = type
    this.disablePrompt = disablePrompt
  }
}

export abstract class AFlag implements IFlag {
  readonly constName: string
  readonly name: string
  readonly alias: string
  readonly definition: Definition
  readonly prompt: PromptFunction

  protected constructor (constName: string, name: string, describe: string, defaultValue: any, type: string, prompt: PromptFunction, alias?: string, disablePrompt: boolean = false) {
    this.constName = constName
    this.name = name
    this.definition = new Definition(describe, defaultValue, type, disablePrompt)
    this.alias = alias
    this.prompt = prompt
  }
}

export class DeletePvcsFlag extends AFlag {
  constructor () {
    super(
        'deletePvcs',
        'delete-pvcs',
        'Delete the persistent volume claims',
        false,
        'boolean',
        async function (task: ListrTaskWrapper<any, any, any>, input: any) {
          return await Prompts.promptToggle(task, input, 'Would you like to delete persistent volume claims upon uninstall? ', null, this)
        }
    )
  }
}

export class DeleteSecretsFlag extends AFlag {
  constructor () {
    super(
        'deleteSecrets',
        'delete-secrets',
        'Delete the network secrets',
        false,
        'boolean',
        async function (task: ListrTaskWrapper<any, any, any>, input: any) {
          return await Prompts.promptToggle(task, input, 'Would you like to delete secrets upon uninstall? ', null, this)
        }
    )
  }
}

export class ForceFlag extends AFlag {
  constructor () {
    super(
        'force',
        'force',
        'Force actions even if those can be skipped',
        false,
        'boolean',
        async function (task: ListrTaskWrapper<any, any, any>, input: any) {
          return await Prompts.promptToggle(task, input, 'Would you like to force changes? ', null, this)
        },
        'f'
    )
  }
}

export class NamespaceFlag extends AFlag {
  constructor () {
    super(
        'namespace',
        'namespace',
        'Namespace',
        'solo',
        'string',
        async function (task: ListrTaskWrapper<any, any, any>, input: any) {
          return await Prompts.promptText(task, input, 'Enter namespace name: ', 'namespace cannot be empty', this)
        },
        'n'
    )
  }
}

export class QuietFlag extends AFlag {
  constructor () {
    super(
        'quiet',
        'quiet-mode',
        'Quiet mode, do not prompt for confirmation',
        false,
        'boolean',
        undefined,
        'q',
        true
    )
  }
}
