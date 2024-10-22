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

// import { type ListrTaskWrapper } from 'listr2'
// import { type PromptFunction, Prompts } from './prompt.js'

// class ADefinition {
//   private readonly _definition: ADefinition
//   private readonly _describe :string
//   private constructor () {
//     this._definition = new ADefinition
//   }
//   static get describe (): string {
//     return this._describe
//   }
//   static get defaultValue(): any
//   static get type(): string
// }
//
// export abstract class AFlag {
//   static get constName(): string
//   static get name(): string
//   static get alias(): string
//   static get definition(): ADefinition
//   static get prompt(): PromptFunction
// }
//
// export class DeletePvcsFlag extends AFlag {
//   constructor () {
//     super(
//         'deletePvcs',
//         'delete-pvcs',
//         'Delete the persistent volume claims',
//         false,
//         'boolean',
//         async function (task: ListrTaskWrapper<any, any, any>, input: any) {
//           return await Prompts.promptToggle(task, input, 'Would you like to delete persistent volume claims upon uninstall? ', null, this)
//         }
//     )
//   }
// }
//
// export class DeleteSecretsFlag extends AFlag {
//   constructor () {
//     super(
//         'deleteSecrets',
//         'delete-secrets',
//         'Delete the network secrets',
//         false,
//         'boolean',
//         async function (task: ListrTaskWrapper<any, any, any>, input: any) {
//           return await Prompts.promptToggle(task, input, 'Would you like to delete secrets upon uninstall? ', null, this)
//         }
//     )
//   }
// }
//
// export class ForceFlag extends AFlag {
//   constructor () {
//     super(
//         'force',
//         'force',
//         'Force actions even if those can be skipped',
//         false,
//         'boolean',
//         async function (task: ListrTaskWrapper<any, any, any>, input: any) {
//           return await Prompts.promptToggle(task, input, 'Would you like to force changes? ', null, this)
//         },
//         'f'
//     )
//   }
// }
//
// export class NamespaceFlag extends AFlag {
//   constructor () {
//     super(
//         'namespace',
//         'namespace',
//         'Namespace',
//         'solo',
//         'string',
//         async function (task: ListrTaskWrapper<any, any, any>, input: any) {
//           return await Prompts.promptText(task, input, 'Enter namespace name: ', 'namespace cannot be empty', this)
//         },
//         'n'
//     )
//   }
// }
//
// export class QuietFlag extends AFlag {
//   constructor () {
//     super(
//         'quiet',
//         'quiet-mode',
//         'Quiet mode, do not prompt for confirmation',
//         false,
//         'boolean',
//         undefined,
//         'q',
//         true
//     )
//   }
// }
