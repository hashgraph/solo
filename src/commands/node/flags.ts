// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../flags.js';

export const DEFAULT_FLAGS = {
  requiredFlags: [],
  requiredFlagsWithDisabledPrompt: [flags.deployment, flags.cacheDir, flags.releaseTag],
  optionalFlags: [flags.quiet, flags.devMode],
};

const COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS = [flags.cacheDir, flags.deployment, flags.releaseTag];
const COMMON_UPGRADE_FLAGS_REQUIRED_NO_PROMPT_FLAGS = [
  flags.app,
  flags.debugNodeAlias,
  flags.nodeAliasesUnparsed,
  flags.soloChartVersion,
];
const COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS = [
  flags.chartDirectory,
  flags.devMode,
  flags.quiet,
  flags.localBuildPath,
  flags.force,
];

const COMMON_UPDATE_FLAGS_REQUIRED_FLAGS = [flags.cacheDir, flags.deployment, flags.releaseTag];
const COMMON_UPDATE_FLAGS_REQUIRED_NO_PROMPT_FLAGS = [
  flags.app,
  flags.debugNodeAlias,
  flags.endpointType,
  flags.soloChartVersion,
];
const COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS = [
  flags.chartDirectory,
  flags.devMode,
  flags.quiet,
  flags.localBuildPath,
  flags.force,
  flags.gossipEndpoints,
  flags.grpcEndpoints,
];

export const UPGRADE_FLAGS = {
  requiredFlags: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS, flags.upgradeZipFile],
  requiredFlagsWithDisabledPrompt: [...COMMON_UPGRADE_FLAGS_REQUIRED_NO_PROMPT_FLAGS],
  optionalFlags: COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS,
};

export const UPGRADE_PREPARE_FLAGS = {
  requiredFlags: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS, flags.upgradeZipFile, flags.outputDir],
  requiredFlagsWithDisabledPrompt: [...COMMON_UPGRADE_FLAGS_REQUIRED_NO_PROMPT_FLAGS],
  optionalFlags: [...COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS],
};

export const UPGRADE_SUBMIT_TRANSACTIONS_FLAGS = {
  requiredFlags: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  requiredFlagsWithDisabledPrompt: [...COMMON_UPGRADE_FLAGS_REQUIRED_NO_PROMPT_FLAGS],
  optionalFlags: [...COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS],
};

export const UPGRADE_EXECUTE_FLAGS = {
  requiredFlags: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  requiredFlagsWithDisabledPrompt: [...COMMON_UPGRADE_FLAGS_REQUIRED_NO_PROMPT_FLAGS],
  optionalFlags: [...COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS],
};

export const UPDATE_FLAGS = {
  requiredFlags: [...COMMON_UPDATE_FLAGS_REQUIRED_FLAGS, flags.nodeAlias],
  requiredFlagsWithDisabledPrompt: [
    ...COMMON_UPDATE_FLAGS_REQUIRED_NO_PROMPT_FLAGS,
    flags.newAdminKey,
    flags.newAccountNumber,
    flags.tlsPublicKey,
    flags.gossipPrivateKey,
    flags.gossipPublicKey,
    flags.tlsPrivateKey,
  ],
  optionalFlags: COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS,
};

export const UPDATE_PREPARE_FLAGS = {
  requiredFlags: [...COMMON_UPDATE_FLAGS_REQUIRED_FLAGS, flags.outputDir, flags.nodeAlias],
  requiredFlagsWithDisabledPrompt: [
    ...COMMON_UPDATE_FLAGS_REQUIRED_NO_PROMPT_FLAGS,
    flags.newAdminKey,
    flags.newAccountNumber,
    flags.tlsPublicKey,
    flags.gossipPrivateKey,
    flags.gossipPublicKey,
    flags.tlsPrivateKey,
  ],
  optionalFlags: [...COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS],
};

export const UPDATE_SUBMIT_TRANSACTIONS_FLAGS = {
  requiredFlags: [...COMMON_UPDATE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  requiredFlagsWithDisabledPrompt: [...COMMON_UPDATE_FLAGS_REQUIRED_NO_PROMPT_FLAGS],
  optionalFlags: [...COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS],
};

export const UPDATE_EXECUTE_FLAGS = {
  requiredFlags: [...COMMON_UPDATE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  requiredFlagsWithDisabledPrompt: [...COMMON_UPDATE_FLAGS_REQUIRED_NO_PROMPT_FLAGS],
  optionalFlags: [...COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS],
};

const COMMON_DELETE_REQUIRED_FLAGS = [flags.cacheDir, flags.deployment, flags.nodeAlias, flags.releaseTag];

const COMMON_DELETE_REQUIRED_NO_PROMPT_FLAGS = [
  flags.app,
  flags.chainId,
  flags.debugNodeAlias,
  flags.endpointType,
  flags.soloChartVersion,
];

const COMMON_DELETE_OPTIONAL_FLAGS = [
  flags.devMode,
  flags.force,
  flags.localBuildPath,
  flags.quiet,
  flags.chartDirectory,
];

const COMMON_ADD_REQUIRED_FLAGS = [
  flags.cacheDir,
  flags.endpointType,
  flags.generateGossipKeys,
  flags.generateTlsKeys,
  flags.deployment,
  flags.releaseTag,
];

const COMMON_ADD_REQUIRED_NO_PROMPT_FLAGS = [
  flags.app,
  flags.chainId,
  flags.debugNodeAlias,
  flags.soloChartVersion,
  flags.persistentVolumeClaims,
  flags.grpcTlsCertificatePath,
  flags.grpcWebTlsCertificatePath,
  flags.grpcTlsKeyPath,
  flags.grpcWebTlsKeyPath,
];

const COMMON_ADD_OPTIONAL_FLAGS = [
  flags.gossipEndpoints,
  flags.grpcEndpoints,
  flags.devMode,
  flags.force,
  flags.localBuildPath,
  flags.chartDirectory,
  flags.quiet,
  flags.clusterRef,
];

export const DELETE_FLAGS = {
  requiredFlags: [...COMMON_DELETE_REQUIRED_FLAGS],
  requiredFlagsWithDisabledPrompt: [...COMMON_DELETE_REQUIRED_NO_PROMPT_FLAGS],
  optionalFlags: [...COMMON_DELETE_OPTIONAL_FLAGS],
};

export const DELETE_PREPARE_FLAGS = {
  requiredFlags: [...COMMON_DELETE_REQUIRED_FLAGS, flags.outputDir],
  requiredFlagsWithDisabledPrompt: [...COMMON_DELETE_REQUIRED_NO_PROMPT_FLAGS],
  optionalFlags: [...COMMON_DELETE_OPTIONAL_FLAGS],
};

export const DELETE_SUBMIT_TRANSACTIONS_FLAGS = {
  requiredFlags: [...COMMON_DELETE_REQUIRED_FLAGS, flags.inputDir],
  requiredFlagsWithDisabledPrompt: [...COMMON_DELETE_REQUIRED_NO_PROMPT_FLAGS],
  optionalFlags: [...COMMON_DELETE_OPTIONAL_FLAGS],
};

export const DELETE_EXECUTE_FLAGS = {
  requiredFlags: [...COMMON_DELETE_REQUIRED_FLAGS, flags.inputDir],
  requiredFlagsWithDisabledPrompt: [...COMMON_DELETE_REQUIRED_NO_PROMPT_FLAGS],
  optionalFlags: [...COMMON_DELETE_OPTIONAL_FLAGS],
};

export const ADD_FLAGS = {
  requiredFlags: [...COMMON_ADD_REQUIRED_FLAGS],
  requiredFlagsWithDisabledPrompt: [...COMMON_ADD_REQUIRED_NO_PROMPT_FLAGS],
  optionalFlags: [...COMMON_ADD_OPTIONAL_FLAGS, flags.adminKey, flags.haproxyIps, flags.envoyIps],
};

export const ADD_PREPARE_FLAGS = {
  requiredFlags: [...COMMON_ADD_REQUIRED_FLAGS, flags.outputDir],
  requiredFlagsWithDisabledPrompt: [...COMMON_ADD_REQUIRED_NO_PROMPT_FLAGS],
  optionalFlags: [...COMMON_ADD_OPTIONAL_FLAGS, flags.adminKey],
};

export const ADD_SUBMIT_TRANSACTIONS_FLAGS = {
  requiredFlags: [...COMMON_ADD_REQUIRED_FLAGS, flags.inputDir],
  requiredFlagsWithDisabledPrompt: [...COMMON_ADD_REQUIRED_NO_PROMPT_FLAGS],
  optionalFlags: [...COMMON_ADD_OPTIONAL_FLAGS],
};

export const ADD_EXECUTE_FLAGS = {
  requiredFlags: [...COMMON_ADD_REQUIRED_FLAGS, flags.inputDir],
  requiredFlagsWithDisabledPrompt: [...COMMON_ADD_REQUIRED_NO_PROMPT_FLAGS],
  optionalFlags: [...COMMON_ADD_OPTIONAL_FLAGS, flags.haproxyIps, flags.envoyIps],
};

export const LOGS_FLAGS = {
  requiredFlags: [flags.deployment, flags.nodeAliasesUnparsed],
  requiredFlagsWithDisabledPrompt: [],
  optionalFlags: [flags.quiet],
};

export const STATES_FLAGS = {
  requiredFlags: [flags.deployment, flags.nodeAliasesUnparsed],
  requiredFlagsWithDisabledPrompt: [],
  optionalFlags: [flags.quiet],
};

export const REFRESH_FLAGS = {
  requiredFlags: [flags.cacheDir, flags.deployment, flags.nodeAliasesUnparsed, flags.releaseTag],
  requiredFlagsWithDisabledPrompt: [flags.app],
  optionalFlags: [flags.localBuildPath, flags.devMode, flags.quiet],
};

export const KEYS_FLAGS = {
  requiredFlags: [flags.cacheDir, flags.generateGossipKeys, flags.generateTlsKeys, flags.deployment],
  requiredFlagsWithDisabledPrompt: [],
  optionalFlags: [
    flags.devMode,
    flags.quiet,
    flags.nodeAliasesUnparsed,
    // TODO remove namespace once the remote config manager is updated to pull the namespace from the local config
    flags.namespace,
  ],
};

export const STOP_FLAGS = {
  requiredFlags: [flags.deployment],
  requiredFlagsWithDisabledPrompt: [flags.nodeAliasesUnparsed],
  optionalFlags: [flags.quiet],
};

export const FREEZE_FLAGS = {
  requiredFlags: [flags.deployment],
  requiredFlagsWithDisabledPrompt: [],
  optionalFlags: [flags.quiet],
};

export const START_FLAGS = {
  requiredFlags: [flags.deployment, flags.releaseTag],
  requiredFlagsWithDisabledPrompt: [flags.app],
  optionalFlags: [flags.quiet, flags.nodeAliasesUnparsed, flags.debugNodeAlias, flags.stateFile, flags.stakeAmounts],
};

export const RESTART_FLAGS = {
  requiredFlags: [flags.deployment],
  requiredFlagsWithDisabledPrompt: [],
  optionalFlags: [flags.quiet],
};

export const SETUP_FLAGS = {
  requiredFlags: [flags.cacheDir, flags.deployment, flags.releaseTag],
  requiredFlagsWithDisabledPrompt: [flags.app, flags.appConfig, flags.nodeAliasesUnparsed],
  optionalFlags: [flags.quiet, flags.devMode, flags.localBuildPath, flags.adminPublicKeys],
};
