/**
 * SPDX-License-Identifier: Apache-2.0
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
    flags.clusterRef,
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
  optionalFlags: [flags.clusterRef, flags.clusterSetupNamespace, flags.force, flags.quiet],
};

export const CONNECT_FLAGS = {
  requiredFlags: [],
  requiredFlagsWithDisabledPrompt: [],
  optionalFlags: [
    flags.devMode,
    flags.deployment,
    flags.quiet,
    flags.clusterRef,
    flags.context,
    flags.namespace,
    flags.userEmailAddress,
  ],
};
