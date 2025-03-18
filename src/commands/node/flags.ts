// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../flags.js';

export const DEFAULT_FLAGS = {
  requiredFlags: [flags.deployment],
  optionalFlags: [flags.quiet, flags.devMode, flags.cacheDir, flags.releaseTag],
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
  requiredFlags: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS, flags.upgradeZipFile],
  optionalFlags: COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS,
};

export const UPGRADE_PREPARE_FLAGS = {
  requiredFlags: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS, flags.upgradeZipFile, flags.outputDir],
  optionalFlags: [...COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS],
};

export const UPGRADE_SUBMIT_TRANSACTIONS_FLAGS = {
  requiredFlags: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  optionalFlags: [...COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS],
};

export const UPGRADE_EXECUTE_FLAGS = {
  requiredFlags: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  optionalFlags: [...COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS],
};

export const UPDATE_FLAGS = {
  requiredFlags: [...COMMON_UPDATE_FLAGS_REQUIRED_FLAGS, flags.nodeAlias],
  optionalFlags: [
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
  requiredFlags: [...COMMON_UPDATE_FLAGS_REQUIRED_FLAGS, flags.outputDir, flags.nodeAlias],
  optionalFlags: [
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
  requiredFlags: [...COMMON_UPDATE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  optionalFlags: [...COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS],
};

export const UPDATE_EXECUTE_FLAGS = {
  requiredFlags: [...COMMON_UPDATE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  optionalFlags: [...COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS],
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
  requiredFlags: [...COMMON_DELETE_REQUIRED_FLAGS],
  optionalFlags: [...COMMON_DELETE_OPTIONAL_FLAGS],
};

export const DELETE_PREPARE_FLAGS = {
  requiredFlags: [...COMMON_DELETE_REQUIRED_FLAGS, flags.outputDir],
  optionalFlags: [...COMMON_DELETE_OPTIONAL_FLAGS],
};

export const DELETE_SUBMIT_TRANSACTIONS_FLAGS = {
  requiredFlags: [...COMMON_DELETE_REQUIRED_FLAGS, flags.inputDir],
  optionalFlags: [...COMMON_DELETE_OPTIONAL_FLAGS],
};

export const DELETE_EXECUTE_FLAGS = {
  requiredFlags: [...COMMON_DELETE_REQUIRED_FLAGS, flags.inputDir],
  optionalFlags: [...COMMON_DELETE_OPTIONAL_FLAGS],
};

export const ADD_FLAGS = {
  requiredFlags: [...COMMON_ADD_REQUIRED_FLAGS],
  optionalFlags: [...COMMON_ADD_OPTIONAL_FLAGS, flags.adminKey, flags.haproxyIps, flags.envoyIps],
};

export const ADD_PREPARE_FLAGS = {
  requiredFlags: [...COMMON_ADD_REQUIRED_FLAGS, flags.outputDir],
  optionalFlags: [...COMMON_ADD_OPTIONAL_FLAGS, flags.adminKey],
};

export const ADD_SUBMIT_TRANSACTIONS_FLAGS = {
  requiredFlags: [...COMMON_ADD_REQUIRED_FLAGS, flags.inputDir],
  optionalFlags: [...COMMON_ADD_OPTIONAL_FLAGS],
};

export const ADD_EXECUTE_FLAGS = {
  requiredFlags: [...COMMON_ADD_REQUIRED_FLAGS, flags.inputDir],
  optionalFlags: [...COMMON_ADD_OPTIONAL_FLAGS, flags.haproxyIps, flags.envoyIps],
};

export const LOGS_FLAGS = {
  requiredFlags: [flags.deployment, flags.nodeAliasesUnparsed],
  optionalFlags: [flags.quiet],
};

export const STATES_FLAGS = {
  requiredFlags: [flags.deployment, flags.nodeAliasesUnparsed],
  optionalFlags: [flags.quiet],
};

export const REFRESH_FLAGS = {
  requiredFlags: [flags.cacheDir, flags.deployment, flags.nodeAliasesUnparsed, flags.releaseTag],
  optionalFlags: [flags.app, flags.localBuildPath, flags.devMode, flags.quiet],
};

export const KEYS_FLAGS = {
  requiredFlags: [flags.cacheDir, flags.generateGossipKeys, flags.generateTlsKeys, flags.deployment],
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
  optionalFlags: [flags.quiet, flags.nodeAliasesUnparsed],
};

export const FREEZE_FLAGS = {
  requiredFlags: [flags.deployment],
  optionalFlags: [flags.quiet],
};

export const START_FLAGS = {
  requiredFlags: [flags.deployment, flags.releaseTag],
  optionalFlags: [
    flags.app,
    flags.quiet,
    flags.nodeAliasesUnparsed,
    flags.debugNodeAlias,
    flags.stateFile,
    flags.stakeAmounts,
  ],
};

export const RESTART_FLAGS = {
  requiredFlags: [flags.deployment],
  optionalFlags: [flags.quiet],
};

export const SETUP_FLAGS = {
  requiredFlags: [flags.cacheDir, flags.deployment, flags.releaseTag],
  optionalFlags: [
    flags.app,
    flags.appConfig,
    flags.nodeAliasesUnparsed,
    flags.quiet,
    flags.devMode,
    flags.localBuildPath,
    flags.adminPublicKeys,
  ],
};
