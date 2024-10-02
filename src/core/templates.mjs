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
'use strict'
import * as x509 from '@peculiar/x509'
import os from 'os'
import path from 'path'
import { DataValidationError, SoloError, IllegalArgumentError, MissingArgumentError } from './errors.mjs'
import { constants } from './index.mjs'

/** @typedef {number} NodeId - the number of the node */
/** @typedef {string} PodName - the full pod name */
/** @typedef {string} NodeAlias - the alias of the node */

/** @typedef {NodeId[]} NodeIds - list of the number of nodes */
/** @typedef {PodName[]} PodNames - list of the pod names */
/** @typedef {NodeAlias[]} NodeAliases - list of the pod aliases */

export class Templates {
  /**
   * @param {NodeAlias} nodeAlias
   * @returns {PodName}
   */
  static renderNetworkPodName (nodeAlias) {
    return `network-${nodeAlias}-0`
  }

  /**
   * @param {NodeAlias} nodeAlias
   * @returns {string}
   */
  static renderNetworkSvcName (nodeAlias) {
    return `network-${nodeAlias}-svc`
  }

  /**
   * @param {string} svcName
   * @returns {NodeAlias}
   */
  static nodeAliasFromNetworkSvcName (svcName) {
    return svcName.split('-').slice(1, -1).join('-')
  }

  /**
   * @param {NodeAlias} nodeAlias
   * @returns {string}
   */
  static renderNetworkHeadlessSvcName (nodeAlias) {
    return `network-${nodeAlias}`
  }

  /**
   * @param {string} prefix
   * @param {NodeAlias} nodeAlias
   * @returns {string}
   */
  static renderGossipPemPrivateKeyFile (prefix, nodeAlias) {
    return `${prefix}-private-${nodeAlias}.pem`
  }

  /**
   * @param {string} prefix
   * @param {NodeAlias} nodeAlias
   * @returns {string}
   */
  static renderGossipPemPublicKeyFile (prefix, nodeAlias) {
    return `${prefix}-public-${nodeAlias}.pem`
  }

  /**
   * @param {NodeAlias} nodeAlias
   * @returns {string}
   */
  static renderTLSPemPrivateKeyFile (nodeAlias) {
    return `hedera-${nodeAlias}.key`
  }

  /**
   * @param {NodeAlias} nodeAlias
   * @returns {string}
   */
  static renderTLSPemPublicKeyFile (nodeAlias) {
    return `hedera-${nodeAlias}.crt`
  }

  /**
   * @param {string} prefix
   * @param {NodeAlias} nodeAlias
   * @param {string} [suffix]
   * @returns {string}
   */
  static renderNodeFriendlyName (prefix, nodeAlias, suffix = '') {
    const parts = [prefix, nodeAlias]
    if (suffix) parts.push(suffix)
    return parts.join('-')
  }

  /**
   * @param {PodName} podName
   * @returns {NodeAlias}
   */
  static extractNodeAliasFromPodName (podName) {
    const parts = podName.split('-')
    if (parts.length !== 3) throw new DataValidationError(`pod name is malformed : ${podName}`, 3, parts.length)
    return parts[1].trim()
  }

  /**
   * @param {string} tag
   * @returns {string}
   */
  static prepareReleasePrefix (tag) {
    if (!tag) throw new MissingArgumentError('tag cannot be empty')

    const parsed = tag.split('.')
    if (parsed.length < 3) throw new Error(`tag (${tag}) must include major, minor and patch fields (e.g. v0.40.4)`)
    return `${parsed[0]}.${parsed[1]}`
  }

  /**
   * renders the name to be used to store the new account key as a Kubernetes secret
   * @param {AccountId|string} accountId
   * @returns {string} the name of the Kubernetes secret to store the account key
   */
  static renderAccountKeySecretName (accountId) {
    return `account-key-${accountId.toString()}`
  }

  /**
   * renders the label selector to be used to fetch the new account key from the Kubernetes secret
   * @param {AccountId|string} accountId
   * @returns {string} the label selector of the Kubernetes secret to retrieve the account key   */
  static renderAccountKeySecretLabelSelector (accountId) {
    return `fullstack.hedera.com/account-id=${accountId.toString()}`
  }

  /**
   * renders the label object to be used to store the new account key in the Kubernetes secret
   * @param {AccountId|string} accountId
   * @returns {{'fullstack.hedera.com/account-id': string}} the label object to be used to
   * store the new account key in the Kubernetes secret
   */
  static renderAccountKeySecretLabelObject (accountId) {
    return {
      'fullstack.hedera.com/account-id': accountId.toString()
    }
  }

  /**
   * @param {NodeAlias} nodeAlias
   * @param {string} [state]
   * @param {string} [locality]
   * @param {string} [org]
   * @param {string} [orgUnit]
   * @param {string} [country]
   * @returns {x509.Name}
   */
  static renderDistinguishedName (nodeAlias,
    state = 'TX',
    locality = 'Richardson',
    org = 'Hedera',
    orgUnit = 'Hedera',
    country = 'US'
  ) {
    return new x509.Name(`CN=${nodeAlias},ST=${state},L=${locality},O=${org},OU=${orgUnit},C=${country}`)
  }

  /**
   * @param {string} cacheDir
   * @param {string} releaseTag
   * @returns {string}
   */
  static renderStagingDir (cacheDir, releaseTag) {
    if (!cacheDir) {
      throw new IllegalArgumentError('cacheDir cannot be empty')
    }

    if (!releaseTag) {
      throw new IllegalArgumentError('releaseTag cannot be empty')
    }

    const releasePrefix = this.prepareReleasePrefix(releaseTag)
    if (!releasePrefix) {
      throw new IllegalArgumentError('releasePrefix cannot be empty')
    }

    return path.resolve(path.join(cacheDir, releasePrefix, 'staging', releaseTag))
  }

  /**
   * @param {string} dep
   * @param {NodeJS.Platform} [osPlatform]
   * @param {string} [installationDir]
   * @returns {string}
   */
  static installationPath (
    dep,
    osPlatform = os.platform(),
    installationDir = path.join(constants.SOLO_HOME_DIR, 'bin')
  ) {
    switch (dep) {
      case constants.HELM:
        if (osPlatform === constants.OS_WINDOWS) {
          return path.join(installationDir, `${dep}.exe`)
        }

        return path.join(installationDir, dep)
      case constants.KEYTOOL:
        if (osPlatform === constants.OS_WINDOWS) {
          return path.join(installationDir, 'jre', 'bin', `${dep}.exe`)
        }

        return path.join(installationDir, 'jre', 'bin', dep)

      default:
        throw new SoloError(`unknown dep: ${dep}`)
    }
  }

  /**
   * @param {string} namespace
   * @param {NodeAlias} nodeAlias
   * @returns {string}
   */
  static renderFullyQualifiedNetworkPodName (namespace, nodeAlias) {
    return `${Templates.renderNetworkPodName(nodeAlias)}.${Templates.renderNetworkHeadlessSvcName(nodeAlias)}.${namespace}.svc.cluster.local`
  }

  /**
   * @param {string} namespace
   * @param {NodeAlias} nodeAlias
   * @returns {string}
   */
  static renderFullyQualifiedNetworkSvcName (namespace, nodeAlias) {
    return `${Templates.renderNetworkSvcName(nodeAlias)}.${namespace}.svc.cluster.local`
  }

  /**
   * @param {string} svcName
   * @returns {NodeAlias}
   */
  static nodeAliasFromFullyQualifiedNetworkSvcName (svcName) {
    const parts = svcName.split('.')
    return this.nodeAliasFromNetworkSvcName(parts[0])
  }

  /**
   * @param {NodeAlias} nodeAlias
   * @returns {NodeId}
   */
  static nodeIdFromNodeAlias (nodeAlias) {
    for (let i = nodeAlias.length - 1; i > 0; i--) {
      if (isNaN(nodeAlias[i])) {
        return parseInt(nodeAlias.substring(i + 1, nodeAlias.length))
      }
    }
  }

  /**
   * @param {NodeAlias} nodeAlias
   * @returns {string}
   */
  static renderGossipKeySecretName (nodeAlias) {
    return `network-${nodeAlias}-keys-secrets`
  }

  /**
   * @param {NodeAlias} nodeAlias
   * @returns {{'fullstack.hedera.com/node-name': string}}
   */
  static renderGossipKeySecretLabelObject (nodeAlias) {
    return {
      'fullstack.hedera.com/node-name': nodeAlias
    }
  }
}
