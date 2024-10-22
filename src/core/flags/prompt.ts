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
import { SoloError } from '../errors.js'
import { ListrEnquirerPromptAdapter } from '@listr2/prompt-adapter-enquirer'
// import { type IFlag } from './flag.js'

// export type PromptFunction = (task: ListrTaskWrapper<any, any, any>, input: any) => Promise<any>
//
// export class Prompts {
//   static async prompt (type: string, task: ListrTaskWrapper<any, any, any>, input: any, flag: IFlag, promptMessage: string, emptyCheckMessage: string | null) {
//     const defaultValue = flag.definition.defaultValue
//     const flagName = flag.name
//     try {
//       let needsPrompt = type === 'toggle' ? (input === undefined || typeof input !== 'boolean') : !input
//       needsPrompt = type === 'number' ? typeof input !== 'number' : needsPrompt
//
//       if (needsPrompt) {
//         if (!process.stdout.isTTY || !process.stdin.isTTY) {
//           // this is to help find issues with prompts running in non-interactive mode, user should supply quite mode,
//           // or provide all flags required for command
//           throw new SoloError('Cannot prompt for input in non-interactive mode')
//         }
//
//         input = await task.prompt(ListrEnquirerPromptAdapter).run({
//           type,
//           default: defaultValue,
//           message: promptMessage
//         })
//       }
//
//       if (emptyCheckMessage && !input) {
//         throw new SoloError(emptyCheckMessage)
//       }
//
//       return input
//     } catch (e: Error | any) {
//       throw new SoloError(`input failed: ${flagName}: ${e.message}`, e)
//     }
//   }
//
//   static async promptToggle (task: ListrTaskWrapper<any, any, any>, input: any, promptMessage: string, emptyCheckMessage: string | null, flag: IFlag) {
//     return await Prompts.prompt('toggle', task, input, flag, promptMessage, emptyCheckMessage)
//   }
//
//   static async promptText (task: ListrTaskWrapper<any, any, any>, input: any, promptMessage: string, emptyCheckMessage: string | null, flag: IFlag) {
//     return await Prompts.prompt('text', task, input, flag, promptMessage, emptyCheckMessage)
//   }
//
// }
