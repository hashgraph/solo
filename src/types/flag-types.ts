// SPDX-License-Identifier: Apache-2.0

import {type SoloListrTaskWrapper} from './index.js';

export type PromptFunction = (task: SoloListrTaskWrapper<any>, input: any, data?: any) => Promise<any>;

export interface CommandFlag {
  constName: string;
  name: string;
  definition: Definition;
  prompt: PromptFunction;
}

export interface Definition {
  describe: string;
  defaultValue?: boolean | string | number;
  alias?: string;
  type?: string;
  disablePrompt?: boolean;
  dataMask?: string;
}

export interface CommandFlags {
  required: CommandFlag[];
  optional: CommandFlag[];
}
