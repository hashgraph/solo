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
import {Flags as flags} from '../../../commands/flags.js';
import type {ToObject} from '../../../types/index.js';
import type {RemoteConfigCommonFlagsStruct} from './types.js';
import type {ConfigManager} from '../../config_manager.js';
import type {CommandFlag} from '../../../types/flag_types.js';

export class CommonFlagsDataWrapper implements ToObject<RemoteConfigCommonFlagsStruct> {
  private static readonly COMMON_FLAGS: CommandFlag[] = [
    flags.nodeAliasesUnparsed,
    flags.releaseTag,
    flags.relayReleaseTag,
    flags.hederaExplorerVersion,
    flags.mirrorNodeVersion,
  ];

  private readonly flags: RemoteConfigCommonFlagsStruct;

  constructor(flags: RemoteConfigCommonFlagsStruct) {
    this.flags = flags;
  }

  /**
   * Updates the flags or populates them inside the remote config
   */
  public handleFlags(configManager: ConfigManager): void {
    CommonFlagsDataWrapper.COMMON_FLAGS.forEach(flag => {
      this.updateFlag(configManager, flag);
    });
  }

  private updateFlag(configManager: ConfigManager, flag: CommandFlag): void {
    const detectFlagMismatch = () => {
      const oldValue = this.flags[flag.constName] as string;
      const newValue = configManager.getFlag<string>(flag);

      // if the old value is not present, override it with the new one
      if (!oldValue) {
        this.flags[flag.constName] = newValue;
      }

      // if its present but there is a mismatch warn user
      else if (oldValue && oldValue !== newValue) {
        // TODO WARN USER AND OVERRIDE WITH NEW VALUE
      }
    };

    // if the flag is set, inspect the value
    if (configManager.hasFlag(flag)) {
      detectFlagMismatch();
    }

    // if the value is not set and exists, override it
    else if (this.flags[flag.constName]) {
      configManager.setFlag(flag, this.flags[flag.constName]);
    }
  }

  public static initializeEmpty() {
    return new CommonFlagsDataWrapper({});
  }

  public static fromObject(data: RemoteConfigCommonFlagsStruct): CommonFlagsDataWrapper {
    return new CommonFlagsDataWrapper(data);
  }

  public toObject(): RemoteConfigCommonFlagsStruct {
    return {
      nodeAliasesUnparsed: this.flags.nodeAliasesUnparsed,
      releaseTag: this.flags.releaseTag,
      relayReleaseTag: this.flags.relayReleaseTag,
      hederaExplorerVersion: this.flags.hederaExplorerVersion,
      mirrorNodeVersion: this.flags.mirrorNodeVersion,
    };
  }
}
