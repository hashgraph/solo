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
import {ListrEnquirerPromptAdapter} from '@listr2/prompt-adapter-enquirer';
import {SoloError, IllegalArgumentError} from '../core/errors.js';
import {ConfigManager} from '../core/index.js';
import type {ListrTaskWrapper} from 'listr2';
import {type CommandFlag} from '../types/index.js';
import {Flags} from './flags.js';

export type PromptFunction = (task: ListrTaskWrapper<any, any, any>, input: any) => Promise<any>;

export class Prompts {
  static async prompt(
    type: string,
    task: ListrTaskWrapper<any, any, any>,
    input: any,
    defaultValue: any,
    promptMessage: string,
    emptyCheckMessage: string | null,
    flagName: string,
  ) {
    try {
      let needsPrompt = type === 'toggle' ? input === undefined || typeof input !== 'boolean' : !input;
      needsPrompt = type === 'number' ? typeof input !== 'number' : needsPrompt;

      if (needsPrompt) {
        if (!process.stdout.isTTY || !process.stdin.isTTY) {
          // this is to help find issues with prompts running in non-interactive mode, user should supply quite mode,
          // or provide all flags required for command
          throw new SoloError('Cannot prompt for input in non-interactive mode');
        }

        input = await task.prompt(ListrEnquirerPromptAdapter).run({
          type,
          default: defaultValue,
          message: promptMessage,
        });
      }

      if (emptyCheckMessage && !input) {
        throw new SoloError(emptyCheckMessage);
      }

      return input;
    } catch (e: Error | any) {
      throw new SoloError(`input failed: ${flagName}: ${e.message}`, e);
    }
  }

  static async promptText(
    task: ListrTaskWrapper<any, any, any>,
    input: any,
    defaultValue: any,
    promptMessage: string,
    emptyCheckMessage: string | null,
    flagName: string,
  ) {
    return await Prompts.prompt('text', task, input, defaultValue, promptMessage, emptyCheckMessage, flagName);
  }

  static async promptToggle(
    task: ListrTaskWrapper<any, any, any>,
    input: any,
    defaultValue: any,
    promptMessage: string,
    emptyCheckMessage: string | null,
    flagName: string,
  ) {
    return await Prompts.prompt('toggle', task, input, defaultValue, promptMessage, emptyCheckMessage, flagName);
  }

  /**
   * Run prompts for the given set of flags
   * @param task task object from listr2
   * @param configManager config manager to store flag values
   * @param flagList list of flag objects
   */
  static async execute(
    task: ListrTaskWrapper<any, any, any>,
    configManager: ConfigManager,
    flagList: CommandFlag[] = [],
  ) {
    if (!configManager || !(configManager instanceof ConfigManager)) {
      throw new IllegalArgumentError('an instance of ConfigManager is required');
    }
    for (const flag of flagList) {
      if (flag.definition.disablePrompt || flag.prompt === undefined) {
        continue;
      }

      if (configManager.getFlag(Flags.quiet)) {
        return;
      }
      const input = await flag.prompt(task, configManager.getFlag(flag));
      configManager.setFlag(flag, input);
    }
  }

  /**
   * Disable prompts for the given set of flags
   * @param flags list of flags to disable prompts for
   */
  static disablePrompts(flags: CommandFlag[]) {
    Flags.resetDisabledPrompts();
    for (const flag of flags) {
      if (flag.definition) {
        flag.definition.disablePrompt = true;
      }
    }
  }
}
