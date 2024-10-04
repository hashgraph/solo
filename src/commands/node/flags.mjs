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

import * as flags from '../flags.mjs'

export const DEFAULT_FLAGS = {
    requiredFlags: [],
    requiredFlagsWithDisabledPrompt: [flags.namespace, flags.cacheDir, flags.releaseTag],
    optionalFlags: [flags.devMode]
}


// TODO change structure

export const UPDATE_FLAGS_LIST = [
    flags.app,
    flags.cacheDir,
    flags.chartDirectory,
    flags.devMode,
    flags.debugNodeAlias,
    flags.endpointType,
    flags.fstChartVersion,
    flags.gossipEndpoints,
    flags.gossipPrivateKey,
    flags.gossipPublicKey,
    flags.grpcEndpoints,
    flags.localBuildPath,
    flags.namespace,
    flags.newAccountNumber,
    flags.newAdminKey,
    flags.nodeAlias,
    flags.quiet,
    flags.releaseTag,
    flags.tlsPrivateKey,
    flags.tlsPublicKey
]

export const COMMON_DELETE_FLAGS_LIST = [
    flags.app,
    flags.cacheDir,
    flags.chartDirectory,
    flags.devMode,
    flags.debugNodeAlias,
    flags.endpointType,
    flags.localBuildPath,
    flags.namespace,
    flags.nodeAlias,
    flags.quiet,
    flags.releaseTag
]


export const DELETE_FLAGS_LIST = [
    ...COMMON_DELETE_FLAGS_LIST
]

export const DELETE_PREPARE_FLAGS_LIST = [
    ...COMMON_DELETE_FLAGS_LIST,
    flags.outputDir
]

export const DELETE_SUBMIT_TRANSACTIONS_FLAGS_LIST = [
    ...COMMON_DELETE_FLAGS_LIST,
    flags.inputDir
]

export const DELETE_EXECUTE_FLAGS_LIST = [
    ...COMMON_DELETE_FLAGS_LIST,
    flags.inputDir
]

export const COMMON_ADD_FLAGS_LIST = [
    flags.app,
    flags.cacheDir,
    flags.chainId,
    flags.chartDirectory,
    flags.devMode,
    flags.debugNodeAlias,
    flags.endpointType,
    flags.fstChartVersion,
    flags.generateGossipKeys,
    flags.generateTlsKeys,
    flags.gossipEndpoints,
    flags.grpcEndpoints,
    flags.localBuildPath,
    flags.quiet,
    flags.namespace,
    flags.releaseTag
]

export const ADD_EXECUTE_FLAGS_LIST = [
    ...COMMON_ADD_FLAGS_LIST,
    flags.inputDir
]

export const ADD_FLAGS_LIST = [
    ...COMMON_ADD_FLAGS_LIST,
    flags.adminKey
]


export const ADD_PREPARE_FLAGS_LIST = [
    ...COMMON_ADD_FLAGS_LIST,
    flags.adminKey,
    flags.outputDir
]


export const ADD_SUBMIT_TRANSACTIONS_FLAGS_LIST = [
    ...COMMON_ADD_FLAGS_LIST,
    flags.inputDir
]


export const REFRESH_FLAGS_LIST = [
    flags.app,
    flags.cacheDir,
    flags.devMode,
    flags.localBuildPath,
    flags.namespace,
    flags.nodeAliasesUnparsed,
    flags.quiet,
    flags.releaseTag
]


export const KEYS_FLAGS_LIST = [
    flags.cacheDir,
    flags.devMode,
    flags.generateGossipKeys,
    flags.generateTlsKeys,
    flags.nodeAliasesUnparsed,
    flags.quiet
]


export const STOP_FLAGS_LIST = [
    flags.namespace,
    flags.nodeAliasesUnparsed,
    flags.quiet
]


export const SETUP_FLAGS_LIST = [
    flags.app,
    flags.appConfig,
    flags.cacheDir,
    flags.devMode,
    flags.localBuildPath,
    flags.namespace,
    flags.nodeAliasesUnparsed,
    flags.releaseTag
]


export const START_FLAGS_LIST = [
    flags.app,
    flags.debugNodeAlias,
    flags.namespace,
    flags.nodeAliasesUnparsed,
    flags.quiet
]

