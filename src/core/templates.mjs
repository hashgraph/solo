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
import * as x509 from '@peculiar/x509'
import { DataValidationError, MissingArgumentError } from './errors.mjs'

export class Templates {
  static renderNetworkPodName (nodeId) {
    return `network-${nodeId}-0`
  }

  static renderNodeSvcName (nodeId) {
    return `network-${nodeId}-svc`
  }

  static renderNetworkSvcName (nodeId) {
    return `network-${nodeId}-svc`
  }

  /**
   * Generate pfx node private key file name
   * @param nodeId node ID
   * @returns {string}
   */
  static renderGossipPfxPrivateKeyFile (nodeId) {
    return `private-${nodeId}.pfx`
  }

  static renderGossipPemPrivateKeyFile (prefix, nodeId) {
    // s-node0-key.pem
    return `${prefix}-private-${nodeId}.pem`
  }

  static renderGossipPemPublicKeyFile (prefix, nodeId) {
    // s-node0-cert.pem
    return `${prefix}-public-${nodeId}.pem`
  }

  static renderTLSPemPrivateKeyFile (nodeId) {
    return `hedera-${nodeId}.key`
  }

  static renderTLSPemPublicKeyFile (nodeId) {
    // s-node0-cert.pem
    return `hedera-${nodeId}.crt`
  }

  static renderNodeFriendlyName (prefix, nodeId, suffix = '') {
    const parts = [prefix, nodeId]
    if (suffix) parts.push(suffix)
    return parts.join('-')
  }

  static extractNodeIdFromPodName (podName) {
    const parts = podName.split('-')
    if (parts.length !== 3) throw new DataValidationError(`pod name is malformed : ${podName}`, 3, parts.length)
    return parts[1].trim()
  }

  static prepareReleasePrefix (tag) {
    if (!tag) throw new MissingArgumentError('tag cannot be empty')

    const parsed = tag.split('.')
    if (parsed.length < 3) throw new Error(`tag (${tag}) must include major, minor and patch fields (e.g. v0.40.4)`)
    return `${parsed[0]}.${parsed[1]}`
  }

  /**
   * renders the name to be used to store the new account key as a Kubernetes secret
   * @param accountId the account ID, string or AccountId type
   * @returns {string} the name of the Kubernetes secret to store the account key
   */
  static renderAccountKeySecretName (accountId) {
    return `account-key-${accountId.toString()}`
  }

  /**
   * renders the label selector to be used to fetch the new account key from the Kubernetes secret
   * @param accountId the account ID, string or AccountId type
   * @returns {string} the label selector of the Kubernetes secret to retrieve the account key   */
  static renderAccountKeySecretLabelSelector (accountId) {
    return `fullstack.hedera.com/account-id=${accountId.toString()}`
  }

  /**
   * renders the label object to be used to store the new account key in the Kubernetes secret
   * @param accountId the account ID, string or AccountId type
   * @returns {{"fullstack.hedera.com/account-id": string}} the label object to be used to
   * store the new account key in the Kubernetes secret
   */
  static renderAccountKeySecretLabelObject (accountId) {
    return {
      'fullstack.hedera.com/account-id': accountId.toString()
    }
  }

  static renderDistinguishedName (nodeId,
    state = 'TX',
    locality = 'Richardson',
    org = 'Hedera',
    orgUnit = 'Hedera',
    country = 'US'
  ) {
    return new x509.Name(`CN=${nodeId},ST=${state},L=${locality},O=${org},OU=${orgUnit},C=${country}`)
  }
}
