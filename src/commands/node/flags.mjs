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

export const UPDATE_FLAGS = {
    requiredFlags: [flags.cacheDir, flags.namespace, flags.nodeAlias, flags.releaseTag],
    requiredFlagsWithDisabledPrompt: [
        flags.app,
        flags.debugNodeAlias,
        flags.endpointType,
        flags.soloChartVersion,
        flags.gossipPrivateKey,
        flags.gossipPublicKey,
        flags.newAccountNumber,
        flags.newAdminKey,
        flags.tlsPrivateKey,
        flags.tlsPublicKey
    ],
    optionalFlags: [flags.chartDirectory, flags.devMode, flags.quiet, flags.localBuildPath, flags.force, flags.gossipEndpoints, flags.grpcEndpoints]
}

const COMMON_DELETE_REQUIRED_FLAGS = [
    flags.cacheDir,
    flags.namespace,
    flags.nodeAlias,
    flags.releaseTag
]

const COMMON_DELETE_REQUIRED_NO_PROMPT_FLAGS = [
    flags.app,
    flags.chainId,
    flags.debugNodeAlias,
    flags.endpointType,
    flags.soloChartVersion
]

const COMMON_DELETE_OPTIONAL_FLAGS = [
    flags.devMode,
    flags.force,
    flags.localBuildPath,
    flags.quiet,
    flags.chartDirectory
]

const COMMON_ADD_REQUIRED_FLAGS = [
    flags.cacheDir,
    flags.chainId,
    flags.devMode,
    flags.endpointType,
    flags.generateGossipKeys,
    flags.generateTlsKeys,
    flags.namespace,
    flags.releaseTag
]

const COMMON_ADD_REQUIRED_NO_PROMPT_FLAGS = [
    flags.app,
    flags.chainId,
    flags.chartDirectory,
    flags.debugNodeAlias,
    flags.endpointType,
    flags.soloChartVersion,
]

const COMMON_ADD_OPTIONAL_FLAGS = [
    flags.gossipEndpoints,
    flags.grpcEndpoints,
    flags.devMode,
    flags.force,
    flags.localBuildPath,
    flags.chartDirectory,
    flags.quiet,
]

export const DELETE_FLAGS = {
    requiredFlags: [...COMMON_DELETE_REQUIRED_FLAGS],
    requiredFlagsWithDisabledPrompt: [...COMMON_DELETE_REQUIRED_NO_PROMPT_FLAGS],
    optionalFlags: [...COMMON_DELETE_OPTIONAL_FLAGS]
}

export const DELETE_PREPARE_FLAGS = {
    requiredFlags: [...COMMON_DELETE_REQUIRED_FLAGS, flags.outputDir],
    requiredFlagsWithDisabledPrompt: [...COMMON_DELETE_REQUIRED_NO_PROMPT_FLAGS],
    optionalFlags: [...COMMON_DELETE_OPTIONAL_FLAGS]
}

export const DELETE_SUBMIT_TRANSACTIONS_FLAGS = {
    requiredFlags: [...COMMON_DELETE_REQUIRED_FLAGS, flags.inputDir],
    requiredFlagsWithDisabledPrompt: [...COMMON_DELETE_REQUIRED_NO_PROMPT_FLAGS],
    optionalFlags: [...COMMON_DELETE_OPTIONAL_FLAGS]
}

export const DELETE_EXECUTE_FLAGS = {
    requiredFlags: [...COMMON_DELETE_REQUIRED_FLAGS, flags.inputDir],
    requiredFlagsWithDisabledPrompt: [...COMMON_DELETE_REQUIRED_NO_PROMPT_FLAGS],
    optionalFlags: [...COMMON_DELETE_OPTIONAL_FLAGS]
}

export const ADD_FLAGS = {
    requiredFlags: [...COMMON_ADD_REQUIRED_FLAGS],
    requiredFlagsWithDisabledPrompt: [...COMMON_ADD_REQUIRED_NO_PROMPT_FLAGS],
    optionalFlags: [...COMMON_ADD_OPTIONAL_FLAGS, flags.adminKey]
}

export const ADD_PREPARE_FLAGS = {
    requiredFlags: [...COMMON_ADD_REQUIRED_FLAGS, flags.outputDir],
    requiredFlagsWithDisabledPrompt: [...COMMON_ADD_REQUIRED_NO_PROMPT_FLAGS],
    optionalFlags: [...COMMON_ADD_OPTIONAL_FLAGS, flags.adminKey]
}

export const ADD_SUBMIT_TRANSACTIONS_FLAGS = {
    requiredFlags: [...COMMON_ADD_REQUIRED_FLAGS, flags.inputDir],
    requiredFlagsWithDisabledPrompt: [...COMMON_ADD_REQUIRED_NO_PROMPT_FLAGS],
    optionalFlags: [...COMMON_ADD_OPTIONAL_FLAGS]
}

export const ADD_EXECUTE_FLAGS = {
    requiredFlags: [...COMMON_ADD_REQUIRED_FLAGS, flags.inputDir],
    requiredFlagsWithDisabledPrompt: [...COMMON_ADD_REQUIRED_NO_PROMPT_FLAGS],
    optionalFlags: [...COMMON_ADD_OPTIONAL_FLAGS]
}

export const LOGS_FLAGS = {
    requiredFlags: [flags.nodeAliasesUnparsed],
    requiredFlagsWithDisabledPrompt: [],
    optionalFlags: []
}

export const REFRESH_FLAGS = {
    requiredFlags: [
        flags.cacheDir,
        flags.namespace,
        flags.nodeAliasesUnparsed,
        flags.releaseTag
    ],
    requiredFlagsWithDisabledPrompt: [
        flags.app
    ],
    optionalFlags: [
        flags.localBuildPath,
        flags.devMode,
        flags.quiet,
    ]
}

export const KEYS_FLAGS = {
    requiredFlags: [
        flags.cacheDir,
        flags.generateGossipKeys,
        flags.generateTlsKeys,
        flags.nodeAliasesUnparsed,
    ],
    requiredFlagsWithDisabledPrompt: [],
    optionalFlags: [
        flags.devMode,
        flags.quiet
    ]
}

export const STOP_FLAGS = {
    requiredFlags: [
        flags.namespace
    ],
    requiredFlagsWithDisabledPrompt: [
        flags.nodeAliasesUnparsed
    ],
    optionalFlags: [
        flags.quiet
    ]
}

export const START_FLAGS = {
    requiredFlags: [
        flags.namespace,
    ],
    requiredFlagsWithDisabledPrompt: [
        flags.app,
        flags.nodeAliasesUnparsed,
    ],
    optionalFlags: [
        flags.quiet,
        flags.debugNodeAlias,
    ]
}

export const SETUP_FLAGS = {
    requiredFlags: [
        flags.cacheDir,
        flags.namespace,
        flags.releaseTag
    ],
    requiredFlagsWithDisabledPrompt: [
        flags.app,
        flags.appConfig,
        flags.nodeAliasesUnparsed,
    ],
    optionalFlags: [
        flags.devMode,
        flags.localBuildPath,
    ]
}