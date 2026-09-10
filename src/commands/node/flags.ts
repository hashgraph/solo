// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../flags.js';
import {type CommandFlag, type CommandFlags} from '../../types/flag-types.js';

const PREPARE_UPGRADE_FLAGS_REQUIRED_FLAGS: CommandFlag[] = [];
const PREPARE_UPGRADE_FLAGS_OPTIONAL_FLAGS: CommandFlag[] = [
  flags.deployment,
  flags.cacheDir,
  flags.debugMode,
  flags.quiet,
  flags.skipNodeAlias,
];
export const PREPARE_UPGRADE_FLAGS: {optional: CommandFlag[]; required: CommandFlag[]} = {
  required: PREPARE_UPGRADE_FLAGS_REQUIRED_FLAGS,
  optional: PREPARE_UPGRADE_FLAGS_OPTIONAL_FLAGS,
};

const COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS: CommandFlag[] = [];
const COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS: CommandFlag[] = [
  flags.deployment,
  flags.app,
  flags.cacheDir,
  flags.debugNodeAlias,
  flags.nodeAliasesUnparsed,
  flags.soloChartVersion,
  flags.chartDirectory,
  flags.debugMode,
  flags.quiet,
  flags.localBuildPath,
  flags.force,
  flags.upgradeZipFile,
  flags.upgradeVersion,
  flags.freezeBlockDrainSeconds,
  flags.skipNodeStart,
];
const UPGRADE_CONFIG_FILE_FLAGS: CommandFlag[] = [
  flags.networkDeploymentValuesFile,
  flags.apiPermissionProperties,
  flags.applicationEnv,
  flags.applicationProperties,
  flags.bootstrapProperties,
  flags.log4j2Xml,
  flags.settingTxt,
];

const COMMON_UPDATE_FLAGS_REQUIRED_FLAGS: CommandFlag[] = [];
const COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS: CommandFlag[] = [
  flags.deployment,
  flags.app,
  flags.cacheDir,
  flags.debugNodeAlias,
  flags.endpointType,
  flags.soloChartVersion,
  flags.chartDirectory,
  flags.debugMode,
  flags.quiet,
  flags.localBuildPath,
  flags.force,
  flags.gossipEndpoints,
  flags.grpcEndpoints,
  flags.domainNames,
  flags.gossipEndpointPort,
  flags.serviceEndpointPort,
  // Keep deprecated legacy flag accepted for backward compatibility.
  flags.releaseTag,
  flags.consensusNodeVersion,
  flags.wrapsKeyPath,
];

export const UPGRADE_FLAGS: CommandFlags = {
  required: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS],
  optional: [
    ...COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS,

    flags.wrapsKeyPath,

    // Node config file flags
    ...UPGRADE_CONFIG_FILE_FLAGS,
  ],
};

export const UPGRADE_PREPARE_FLAGS: CommandFlags = {
  required: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS, flags.outputDir],
  optional: [...COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS, ...UPGRADE_CONFIG_FILE_FLAGS],
};

export const UPGRADE_SUBMIT_TRANSACTIONS_FLAGS: CommandFlags = {
  required: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS],
};

export const UPGRADE_EXECUTE_FLAGS: CommandFlags = {
  required: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS, ...UPGRADE_CONFIG_FILE_FLAGS],
};

export const UPDATE_FLAGS: CommandFlags = {
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

export const UPDATE_PREPARE_FLAGS: CommandFlags = {
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

export const UPDATE_SUBMIT_TRANSACTIONS_FLAGS: CommandFlags = {
  required: [...COMMON_UPDATE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS],
};

export const UPDATE_EXECUTE_FLAGS: CommandFlags = {
  required: [...COMMON_UPDATE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS, flags.adminKey, flags.newAdminKey, flags.newAccountNumber],
};

const COMMON_DESTROY_REQUIRED_FLAGS: CommandFlag[] = [flags.nodeAlias];

const COMMON_DESTROY_OPTIONAL_FLAGS: CommandFlag[] = [
  flags.deployment,
  flags.cacheDir,
  flags.app,
  flags.chainId,
  flags.debugNodeAlias,
  flags.endpointType,
  flags.soloChartVersion,
  flags.debugMode,
  flags.force,
  flags.localBuildPath,
  flags.quiet,
  flags.chartDirectory,
  flags.domainNames,
  flags.gossipEndpointPort,
  flags.serviceEndpointPort,
  // Keep deprecated legacy flag accepted for backward compatibility.
  flags.releaseTag,
  flags.consensusNodeVersion,
];

const COMMON_ADD_REQUIRED_FLAGS: CommandFlag[] = [];

const COMMON_ADD_OPTIONAL_FLAGS: CommandFlag[] = [
  flags.deployment,
  flags.app,
  flags.chainId,
  flags.clusterRef,
  flags.debugNodeAlias,
  flags.soloChartVersion,
  flags.persistentVolumeClaims,
  flags.grpcTlsCertificatePath,
  flags.grpcWebTlsCertificatePath,
  flags.grpcTlsKeyPath,
  flags.grpcWebTlsKeyPath,
  flags.gossipEndpoints,
  flags.grpcEndpoints,
  flags.debugMode,
  flags.force,
  flags.localBuildPath,
  flags.chartDirectory,
  flags.quiet,
  flags.domainNames,
  flags.gossipEndpointPort,
  flags.serviceEndpointPort,
  flags.cacheDir,
  flags.endpointType,
  flags.generateGossipKeys,
  flags.generateTlsKeys,
  // Keep deprecated legacy flag accepted for backward compatibility.
  flags.releaseTag,
  flags.consensusNodeVersion,
  flags.blockNodeMapping,
  flags.externalBlockNodeMapping,
  flags.grpcWebEndpoint,
  flags.wrapsKeyPath,
];

export const DESTROY_FLAGS: CommandFlags = {
  required: [...COMMON_DESTROY_REQUIRED_FLAGS],
  optional: [...COMMON_DESTROY_OPTIONAL_FLAGS],
};

export const DESTROY_PREPARE_FLAGS: CommandFlags = {
  required: [...COMMON_DESTROY_REQUIRED_FLAGS, flags.outputDir],
  optional: [...COMMON_DESTROY_OPTIONAL_FLAGS],
};

export const DESTROY_SUBMIT_TRANSACTIONS_FLAGS: CommandFlags = {
  required: [...COMMON_DESTROY_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_DESTROY_OPTIONAL_FLAGS],
};

export const DESTROY_EXECUTE_FLAGS: CommandFlags = {
  required: [...COMMON_DESTROY_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_DESTROY_OPTIONAL_FLAGS],
};

export const ADD_FLAGS: CommandFlags = {
  required: [...COMMON_ADD_REQUIRED_FLAGS],
  optional: [...COMMON_ADD_OPTIONAL_FLAGS, flags.adminKey, flags.haproxyIps, flags.envoyIps],
};

export const ADD_PREPARE_FLAGS: CommandFlags = {
  required: [...COMMON_ADD_REQUIRED_FLAGS, flags.outputDir],
  optional: [...COMMON_ADD_OPTIONAL_FLAGS, flags.adminKey],
};

export const ADD_SUBMIT_TRANSACTIONS_FLAGS: CommandFlags = {
  required: [...COMMON_ADD_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_ADD_OPTIONAL_FLAGS],
};

export const ADD_EXECUTE_FLAGS: CommandFlags = {
  required: [...COMMON_ADD_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_ADD_OPTIONAL_FLAGS, flags.adminKey, flags.haproxyIps, flags.envoyIps],
};

export const LOGS_FLAGS: CommandFlags = {
  required: [],
  optional: [flags.deployment, flags.quiet, flags.outputDir],
};

export const REPORT_FLAGS: CommandFlags = {
  required: [],
  optional: [flags.deployment, flags.quiet, flags.outputDir],
};

export const ANALYZE_FLAGS: CommandFlags = {
  required: [],
  optional: [flags.inputDir, flags.quiet],
};

export const STATES_FLAGS: CommandFlags = {
  required: [flags.nodeAliasesUnparsed],
  optional: [flags.deployment, flags.clusterRef, flags.quiet],
};

export const REFRESH_FLAGS: CommandFlags = {
  required: [],
  optional: [
    flags.deployment,
    flags.app,
    flags.localBuildPath,
    flags.debugMode,
    flags.quiet,
    flags.nodeAliasesUnparsed,
    // Keep deprecated legacy flag accepted for backward compatibility.
    flags.releaseTag,
    flags.consensusNodeVersion,
    flags.cacheDir,
    flags.domainNames,
    flags.gossipEndpointPort,
    flags.serviceEndpointPort,
  ],
};

export const KEYS_FLAGS: CommandFlags = {
  required: [],
  optional: [
    flags.deployment,
    flags.cacheDir,
    flags.generateGossipKeys,
    flags.generateTlsKeys,
    flags.debugMode,
    flags.quiet,
    flags.nodeAliasesUnparsed,
    // TODO remove namespace once the remote config manager is updated to pull the namespace from the local config
    flags.namespace,
  ],
};

export const STOP_FLAGS: CommandFlags = {
  required: [],
  optional: [flags.deployment, flags.quiet, flags.nodeAliasesUnparsed],
};

export const FREEZE_FLAGS: CommandFlags = {
  required: [],
  optional: [flags.deployment, flags.quiet, flags.freezeBlockDrainSeconds],
};

export const START_FLAGS: CommandFlags = {
  required: [],
  optional: [
    flags.deployment,
    flags.app,
    flags.quiet,
    flags.nodeAliasesUnparsed,
    flags.debugNodeAlias,
    flags.stateFile,
    flags.stakeAmounts,
    flags.forcePortForward,
    flags.externalAddress,
    flags.wrapsKeyPath,
    flags.grpcWebEndpoints,
    flags.skipGrpcWebEndpoint,
  ],
};

export const RESTART_FLAGS: CommandFlags = {
  required: [],
  optional: [flags.deployment, flags.quiet, flags.wrapsKeyPath],
};

export const SETUP_FLAGS: CommandFlags = {
  required: [],
  optional: [
    flags.deployment,
    flags.cacheDir,
    // Keep deprecated legacy flag accepted for backward compatibility.
    flags.releaseTag,
    flags.consensusNodeVersion,
    flags.app,
    flags.appConfig,
    flags.nodeAliasesUnparsed,
    flags.quiet,
    flags.debugMode,
    flags.localBuildPath,
    flags.adminPublicKeys,
    flags.domainNames,
    flags.gossipEndpointPort,
    flags.serviceEndpointPort,
  ],
};

export const COLLECT_JFR_FLAGS: CommandFlags = {
  required: [flags.nodeAlias],
  optional: [flags.deployment, flags.quiet, flags.debugMode],
};

export const DIAGNOSTICS_CONNECTIONS: CommandFlags = {
  required: [],
  optional: [flags.deployment, flags.quiet, flags.debugMode, flags.check],
};
