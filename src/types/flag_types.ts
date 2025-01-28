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
import type {ListrTaskWrapper} from 'listr2';

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
