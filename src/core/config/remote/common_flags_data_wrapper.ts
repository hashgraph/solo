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
import type {AnyObject} from '../../../types/aliases.js';

export class CommonFlagsDataWrapper implements ToObject<RemoteConfigCommonFlagsStruct> {
  private static readonly COMMON_FLAGS: CommandFlag[] = [
    flags.releaseTag,
    flags.chartDirectory,
    flags.relayReleaseTag,
    flags.soloChartVersion,
    flags.mirrorNodeVersion,
    flags.nodeAliasesUnparsed,
    flags.hederaExplorerVersion,
  ];

  private constructor(
    private readonly configManager: ConfigManager,
    private readonly flags: RemoteConfigCommonFlagsStruct,
  ) {}

  /**
   * Updates the flags or populates them inside the remote config
   */
  public handleFlags(argv: AnyObject): void {
    this.configManager.update(argv);

    CommonFlagsDataWrapper.COMMON_FLAGS.forEach(flag => {
      this.updateFlag(flag);
    });
  }

  private updateFlag(flag: CommandFlag): void {
    const detectFlagMismatch = () => {
      const oldValue = this.flags[flag.constName] as string;
      const newValue = this.configManager.getFlag<string>(flag);

      // if the old value is not present, override it with the new one
      if (!oldValue) {
        this.flags[flag.constName] = newValue;
      }

      // if its present but there is a mismatch warn user
      else if (oldValue && oldValue !== newValue) {
        // TODO: WARN THE USER
        this.flags[flag.constName] = newValue;
      }
    };

    // if the flag is set, inspect the value
    if (this.configManager.hasFlag(flag)) {
      detectFlagMismatch();
    }

    // if the value is not set and exists, override it
    else if (this.flags[flag.constName]) {
      this.configManager.setFlag(flag, this.flags[flag.constName]);
    }
  }

  public static initializeEmpty(configManager: ConfigManager, argv: AnyObject): CommonFlagsDataWrapper {
    const commonFlagsDataWrapper = new CommonFlagsDataWrapper(configManager, {});
    commonFlagsDataWrapper.handleFlags(argv);
    return commonFlagsDataWrapper;
  }

  public static fromObject(configManager: ConfigManager, data: RemoteConfigCommonFlagsStruct): CommonFlagsDataWrapper {
    return new CommonFlagsDataWrapper(configManager, data);
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
