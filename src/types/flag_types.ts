// SPDX-License-Identifier: Apache-2.0

import {type ListrTaskWrapper} from 'listr2';

export type PromptFunction = (task: ListrTaskWrapper<any, any, any>, input: any, data?: any) => Promise<any>;

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
