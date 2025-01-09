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

import {Flags as flags} from '../flags.js';

export const DEFAULT_FLAGS = {
  requiredFlags: [],
  requiredFlagsWithDisabledPrompt: [],
  optionalFlags: [],
};

export const SETUP_FLAGS = {
  requiredFlags: [],
  requiredFlagsWithDisabledPrompt: [],
  optionalFlags: [
    flags.chartDirectory,
    flags.clusterName,
    flags.clusterSetupNamespace,
    flags.deployCertManager,
    flags.deployCertManagerCrds,
    flags.deployMinio,
    flags.deployPrometheusStack,
    flags.quiet,
    flags.soloChartVersion,
  ],
};

export const RESET_FLAGS = {
  requiredFlags: [],
  requiredFlagsWithDisabledPrompt: [],
  optionalFlags: [flags.clusterName, flags.clusterSetupNamespace, flags.force, flags.quiet],
};

export const USE_FLAGS = {
  requiredFlags: [],
  requiredFlagsWithDisabledPrompt: [],
  optionalFlags: [
    flags.devMode,
    flags.quiet,
    flags.clusterName,
    flags.context,
    flags.namespace,
    flags.userEmailAddress,
  ],
};
