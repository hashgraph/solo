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

import {type NodeAlias} from '../../types/aliases.js';

export const CONNECT_CONFIGS_NAME = 'connectConfig';

export const connectConfigBuilder = async function (argv, ctx, task) {
  const config = this.getConfig(CONNECT_CONFIGS_NAME, argv.flags, [
      'currentDeploymentName'
  ]) as ContextConnectConfigClass;

  // set config in the context for later tasks to use
  ctx.config = config;

  return ctx.config;
};

export interface ContextConnectConfigClass {
  app: string;
  cacheDir: string;
  devMode: boolean;
  namespace: string;
  nodeAlias: NodeAlias;
  context: string;
  clusterName: string;
}
