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

export class Templates {
  /**
   * @param {string} nodeId
   * @returns {string}
   */
  static renderNetworkPodName (nodeId) {
    return `network-${nodeId}-0`
  }

  /**
   * @param {string} nodeId
   * @returns {string}
   */
  static renderNetworkSvcName (nodeId) {
    return `network-${nodeId}-svc`
  }

  /**
   * @param {string} svcName
   * @returns {string}
   */
  static nodeIdFromNetworkSvcName (svcName) {
    return svcName.split('-').slice(1, -1).join('-')
  }

  /**
   * @param {string} nodeId
   * @returns {string}
   */
  static renderNetworkHeadlessSvcName (nodeId) {
    return `network-${nodeId}`
  }

  /**
   * @param {string} prefix
   * @param {string} nodeId
   * @returns {string}
   */
  static renderGossipPemPrivateKeyFile (prefix, nodeId) {
    return `${prefix}-private-${nodeId}.pem`
  }

  /**
   * @param {string} prefix
   * @param {string} nodeId
   * @returns {string}
   */
  static renderGossipPemPublicKeyFile (prefix, nodeId) {
    return `${prefix}-public-${nodeId}.pem`
  }

  /**
   * @param {string} nodeId
   * @returns {string}
   */
  static renderTLSPemPrivateKeyFile (nodeId) {
    return `hedera-${nodeId}.key`
  }

  /**
   * @param {string} nodeId
   * @returns {string}
   */
  static renderTLSPemPublicKeyFile (nodeId) {
    return `hedera-${nodeId}.crt`
  }

  /**
   * @param {string} prefix
   * @param {string} nodeId
   * @param {string} [suffix]
   * @returns {string}
   */
  static renderNodeFriendlyName (prefix, nodeId, suffix = '') {
    const parts = [prefix, nodeId]
    if (suffix) parts.push(suffix)
    return parts.join('-')
  }

  /**
   * @param {string} podName
   * @returns {string}
   */
  static extractNodeIdFromPodName (podName) {
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
   * @param {string} nodeId
   * @param {string} [state]
   * @param {string} [locality]
   * @param {string} [org]
   * @param {string} [orgUnit]
   * @param {string} [country]
   * @returns {x509.Name}
   */
  static renderDistinguishedName (nodeId,
    state = 'TX',
    locality = 'Richardson',
    org = 'Hedera',
    orgUnit = 'Hedera',
    country = 'US'
  ) {
    return new x509.Name(`CN=${nodeId},ST=${state},L=${locality},O=${org},OU=${orgUnit},C=${country}`)
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
   * @param {string} nodeId
   * @returns {string}
   */
  static renderFullyQualifiedNetworkPodName (namespace, nodeId) {
    return `${Templates.renderNetworkPodName(nodeId)}.${Templates.renderNetworkHeadlessSvcName(nodeId)}.${namespace}.svc.cluster.local`
  }

  /**
   * @param {string} namespace
   * @param {string} nodeId
   * @returns {string}
   */
  static renderFullyQualifiedNetworkSvcName (namespace, nodeId) {
    return `${Templates.renderNetworkSvcName(nodeId)}.${namespace}.svc.cluster.local`
  }

  /**
   * @param {string} svcName
   * @returns {string}
   */
  static nodeIdFromFullyQualifiedNetworkSvcName (svcName) {
    const parts = svcName.split('.')
    return this.nodeIdFromNetworkSvcName(parts[0])
  }

  /**
   * @param {string} nodeId
   * @returns {number}
   */
  static nodeNumberFromNodeId (nodeId) {
    for (let i = nodeId.length - 1; i > 0; i--) {
      if (isNaN(nodeId[i])) {
        return parseInt(nodeId.substring(i + 1, nodeId.length))
      }
    }
  }

  static renderGossipKeySecretName (nodeId) {
    return `network-${nodeId}-keys-secrets`
  }

  static renderGossipKeySecretLabelObject (nodeId) {
    return {
      'fullstack.hedera.com/node-name': nodeId
    }
  }
}
