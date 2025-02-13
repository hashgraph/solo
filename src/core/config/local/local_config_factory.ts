/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type LocalConfig} from './local_config.js';

export interface LocalConfigFactory {
  empty(): Promise<LocalConfig>;

  load(): Promise<LocalConfig>;

  loadOrEmpty(): Promise<LocalConfig>;
}
