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
import type {ListrTask} from 'listr2';
import type {BaseCommand} from '../../../commands/base.js';
import type {Cluster, Context, Namespace} from './types.js';
import type {AnyObject} from '../../../types/aliases.js';

/**
 * Static class that handles all tasks related to remote config used by other commands.
 */
export class RemoteConfigTasks {
  /* ----------- Create and Load ----------- */

  /**
   * Loads the remote config from the config class.
   *
   * @param argv - used to update the last executed command and command history
   */
  public static loadRemoteConfig(this: BaseCommand, argv: any): ListrTask<any, any, any> {
    return this.remoteConfigManager.buildLoadTask(argv);
  }

  /** Creates remote config. */
  public static createRemoteConfig(
    this: BaseCommand,
    cluster: Cluster,
    context: Context,
    namespace: Namespace,
    argv: AnyObject,
  ): ListrTask<any, any, any> {
    return this.remoteConfigManager.buildCreateTask(cluster, context, namespace, argv);
  }
}
