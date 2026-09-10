// SPDX-License-Identifier: Apache-2.0

import {type SoloListrTaskWrapper} from './index.js';
import {type Definition} from './definition.js';
import {type FlagRule} from './flag-rule.js';

export type PromptFunction = (task: SoloListrTaskWrapper<any>, input: any, data?: any) => Promise<any>;

export interface CommandFlag {
  constName: string;
  name: string;
  definition: Definition;
  prompt?: PromptFunction;
  rules?: FlagRule[];
}
