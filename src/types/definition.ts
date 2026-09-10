// SPDX-License-Identifier: Apache-2.0

import {type FlagDeprecation} from './flag-deprecation.js';

export interface Definition {
  describe: string;
  defaultValue?: boolean | string | number;
  alias?: string | string[];
  type?: string;
  disablePrompt?: boolean;
  dataMask?: string;
  // message shown when interactively prompting for a missing flag value
  promptText?: string;
  // default offered by the interactive prompt when it differs from defaultValue
  promptDefaultValue?: boolean | string | number;
  // when set, an empty prompt answer is rejected with this message
  emptyCheckMessage?: string;
  deprecated?: FlagDeprecation;
}
