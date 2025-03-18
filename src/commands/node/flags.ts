// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../flags.js';

export const DEFAULT_FLAGS = {
  required: [flags.deployment],
  optional: [flags.quiet, flags.devMode, flags.cacheDir, flags.releaseTag],
};

const COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS = [flags.cacheDir, flags.deployment, flags.releaseTag];
const COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS = [
  flags.app,
  flags.debugNodeAlias,
  flags.nodeAliasesUnparsed,
  flags.soloChartVersion,
  flags.chartDirectory,
  flags.devMode,
  flags.quiet,
  flags.localBuildPath,
  flags.force,
];

const COMMON_UPDATE_FLAGS_REQUIRED_FLAGS = [flags.cacheDir, flags.deployment, flags.releaseTag];
const COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS = [
  flags.app,
  flags.debugNodeAlias,
  flags.endpointType,
  flags.soloChartVersion,
  flags.chartDirectory,
  flags.devMode,
  flags.quiet,
  flags.localBuildPath,
  flags.force,
  flags.gossipEndpoints,
  flags.grpcEndpoints,
];

export const UPGRADE_FLAGS = {
  required: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS, flags.upgradeZipFile],
  optional: COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS,
};

export const UPGRADE_PREPARE_FLAGS = {
  required: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS, flags.upgradeZipFile, flags.outputDir],
  optional: [...COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS],
};

export const UPGRADE_SUBMIT_TRANSACTIONS_FLAGS = {
  required: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS],
};

export const UPGRADE_EXECUTE_FLAGS = {
  required: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS],
};

export const UPDATE_FLAGS = {
  required: [...COMMON_UPDATE_FLAGS_REQUIRED_FLAGS, flags.nodeAlias],
  optional: [
    ...COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS,
    flags.newAdminKey,
    flags.newAccountNumber,
    flags.tlsPublicKey,
    flags.gossipPrivateKey,
    flags.gossipPublicKey,
    flags.tlsPrivateKey,
  ],
};

export const UPDATE_PREPARE_FLAGS = {
  required: [...COMMON_UPDATE_FLAGS_REQUIRED_FLAGS, flags.outputDir, flags.nodeAlias],
  optional: [
    ...COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS,
    flags.newAdminKey,
    flags.newAccountNumber,
    flags.tlsPublicKey,
    flags.gossipPrivateKey,
    flags.gossipPublicKey,
    flags.tlsPrivateKey,
  ],
};

export const UPDATE_SUBMIT_TRANSACTIONS_FLAGS = {
  required: [...COMMON_UPDATE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS],
};

export const UPDATE_EXECUTE_FLAGS = {
  required: [...COMMON_UPDATE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS],
};

const COMMON_DELETE_REQUIRED_FLAGS = [flags.cacheDir, flags.deployment, flags.nodeAlias, flags.releaseTag];

const COMMON_DELETE_OPTIONAL_FLAGS = [
  flags.app,
  flags.chainId,
  flags.debugNodeAlias,
  flags.endpointType,
  flags.soloChartVersion,
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

const COMMON_ADD_OPTIONAL_FLAGS = [
  flags.app,
  flags.chainId,
  flags.debugNodeAlias,
  flags.soloChartVersion,
  flags.persistentVolumeClaims,
  flags.grpcTlsCertificatePath,
  flags.grpcWebTlsCertificatePath,
  flags.grpcTlsKeyPath,
  flags.grpcWebTlsKeyPath,
  flags.gossipEndpoints,
  flags.grpcEndpoints,
  flags.devMode,
  flags.force,
  flags.localBuildPath,
  flags.chartDirectory,
  flags.quiet,
];

export const DELETE_FLAGS = {
  required: [...COMMON_DELETE_REQUIRED_FLAGS],
  optional: [...COMMON_DELETE_OPTIONAL_FLAGS],
};

export const DELETE_PREPARE_FLAGS = {
  required: [...COMMON_DELETE_REQUIRED_FLAGS, flags.outputDir],
  optional: [...COMMON_DELETE_OPTIONAL_FLAGS],
};

export const DELETE_SUBMIT_TRANSACTIONS_FLAGS = {
  required: [...COMMON_DELETE_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_DELETE_OPTIONAL_FLAGS],
};

export const DELETE_EXECUTE_FLAGS = {
  required: [...COMMON_DELETE_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_DELETE_OPTIONAL_FLAGS],
};

export const ADD_FLAGS = {
  required: [...COMMON_ADD_REQUIRED_FLAGS],
  optional: [...COMMON_ADD_OPTIONAL_FLAGS, flags.adminKey, flags.haproxyIps, flags.envoyIps],
};

export const ADD_PREPARE_FLAGS = {
  required: [...COMMON_ADD_REQUIRED_FLAGS, flags.outputDir],
  optional: [...COMMON_ADD_OPTIONAL_FLAGS, flags.adminKey],
};

export const ADD_SUBMIT_TRANSACTIONS_FLAGS = {
  required: [...COMMON_ADD_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_ADD_OPTIONAL_FLAGS],
};

export const ADD_EXECUTE_FLAGS = {
  required: [...COMMON_ADD_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_ADD_OPTIONAL_FLAGS, flags.haproxyIps, flags.envoyIps],
};

export const LOGS_FLAGS = {
  required: [flags.deployment, flags.nodeAliasesUnparsed],
  optional: [flags.quiet],
};

export const STATES_FLAGS = {
  required: [flags.deployment, flags.nodeAliasesUnparsed],
  optional: [flags.quiet],
};

export const REFRESH_FLAGS = {
  required: [flags.cacheDir, flags.deployment, flags.nodeAliasesUnparsed, flags.releaseTag],
  optional: [flags.app, flags.localBuildPath, flags.devMode, flags.quiet],
};

export const KEYS_FLAGS = {
  required: [flags.cacheDir, flags.generateGossipKeys, flags.generateTlsKeys, flags.deployment],
  optional: [
    flags.devMode,
    flags.quiet,
    flags.nodeAliasesUnparsed,
    // TODO remove namespace once the remote config manager is updated to pull the namespace from the local config
    flags.namespace,
  ],
};

export const STOP_FLAGS = {
  required: [flags.deployment],
  optional: [flags.quiet, flags.nodeAliasesUnparsed],
};

export const FREEZE_FLAGS = {
  required: [flags.deployment],
  optional: [flags.quiet],
};

export const START_FLAGS = {
  required: [flags.deployment, flags.releaseTag],
  optional: [
    flags.app,
    flags.quiet,
    flags.nodeAliasesUnparsed,
    flags.debugNodeAlias,
    flags.stateFile,
    flags.stakeAmounts,
  ],
};

export const RESTART_FLAGS = {
  required: [flags.deployment],
  optional: [flags.quiet],
};

export const SETUP_FLAGS = {
  required: [flags.cacheDir, flags.deployment, flags.releaseTag],
  optional: [
    flags.app,
    flags.appConfig,
    flags.nodeAliasesUnparsed,
    flags.quiet,
    flags.devMode,
    flags.localBuildPath,
    flags.adminPublicKeys,
  ],
};
