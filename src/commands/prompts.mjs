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
import { ListrEnquirerPromptAdapter } from '@listr2/prompt-adapter-enquirer'
import fs from 'fs'
import { FullstackTestingError, IllegalArgumentError } from '../core/errors.mjs'
import { constants } from '../core/index.mjs'
import * as flags from './flags.mjs'
import * as helpers from '../core/helpers.mjs'

async function prompt (type, task, input, defaultValue, promptMessage, emptyCheckMessage, flagName) {
  try {
    let needsPrompt = type === 'toggle' ? (input === undefined || typeof input !== 'boolean') : !input
    needsPrompt = type === 'number' ? typeof input !== 'number' : needsPrompt

    if (needsPrompt) {
      input = await task.prompt(ListrEnquirerPromptAdapter).run({
        type,
        default: defaultValue,
        message: promptMessage
      })
    }

    if (emptyCheckMessage && !input) {
      throw new FullstackTestingError(emptyCheckMessage)
    }

    return input
  } catch (e) {
    throw new FullstackTestingError(`input failed: ${flagName}: ${e.message}`, e)
  }
}
async function promptText (task, input, defaultValue, promptMessage, emptyCheckMessage, flagName) {
  return await prompt('text', task, input, defaultValue, promptMessage, emptyCheckMessage, flagName)
}

async function promptToggle (task, input, defaultValue, promptMessage, emptyCheckMessage, flagName) {
  return await prompt('toggle', task, input, defaultValue, promptMessage, emptyCheckMessage, flagName)
}

export async function promptNamespace (task, input) {
  return await promptText(task, input,
    'solo',
    'Enter namespace name: ',
    'namespace cannot be empty',
    flags.namespace.name)
}

export async function promptClusterSetupNamespace (task, input) {
  return await promptText(task, input,
    'solo-cluster',
    'Enter cluster setup namespace name: ',
    'cluster setup namespace cannot be empty',
    flags.clusterSetupNamespace.name)
}

export async function promptNodeIds (task, input) {
  return await prompt('input', task, input,
    'node0,node1,node2',
    'Enter list of node IDs (comma separated list): ',
    null,
    flags.nodeIDs.name)
}

export async function promptReleaseTag (task, input) {
  return await promptText(task, input,
    'v0.42.5',
    'Enter release version: ',
    'release tag cannot be empty',
    flags.releaseTag.name)
}

export async function promptRelayReleaseTag (task, input) {
  return await promptText(task, input,
    flags.relayReleaseTag.definition.defaultValue,
    'Enter relay release version: ',
    'relay-release-tag cannot be empty',
    flags.relayReleaseTag.name)
}

export async function promptCacheDir (task, input) {
  return await promptText(task, input,
    constants.SOLO_CACHE_DIR,
    'Enter local cache directory path: ',
    null,
    flags.cacheDir.name)
}

export async function promptForce (task, input) {
  return await promptToggle(task, input,
    flags.force.definition.defaultValue,
    'Would you like to force changes? ',
    null,
    flags.force.name)
}

export async function promptChainId (task, input) {
  return await promptText(task, input,
    flags.chainId.definition.defaultValue,
    'Enter chain ID: ',
    null,
    flags.chainId.name)
}

export async function promptChartDir (task, input) {
  try {
    if (input && !fs.existsSync(input)) {
      input = await task.prompt(ListrEnquirerPromptAdapter).run({
        type: 'text',
        default: flags.chartDirectory.definition.defaultValue,
        message: 'Enter local charts directory path: '
      })

      if (!fs.existsSync(input)) {
        throw new IllegalArgumentError('Invalid chart directory', input)
      }
    }

    return input
  } catch (e) {
    throw new FullstackTestingError(`input failed: ${flags.chartDirectory.name}`, e)
  }
}

export async function promptValuesFile (task, input) {
  try {
    if (input && !fs.existsSync(input)) {
      input = await task.prompt(ListrEnquirerPromptAdapter).run({
        type: 'text',
        default: flags.valuesFile.definition.defaultValue,
        message: 'Enter path to values.yaml: '
      })

      if (!fs.existsSync(input)) {
        throw new IllegalArgumentError('Invalid values.yaml file', input)
      }
    }

    return input
  } catch (e) {
    throw new FullstackTestingError(`input failed: ${flags.valuesFile.name}`, e)
  }
}

export async function promptDeployPrometheusStack (task, input) {
  return await promptToggle(task, input,
    flags.deployPrometheusStack.definition.defaultValue,
    'Would you like to deploy prometheus stack? ',
    null,
    flags.deployPrometheusStack.name)
}

export async function promptEnablePrometheusSvcMonitor (task, input) {
  return await promptToggle(task, input,
    flags.enablePrometheusSvcMonitor.definition.defaultValue,
    'Would you like to enable the Prometheus service monitor for the network nodes? ',
    null,
    flags.enablePrometheusSvcMonitor.name)
}

export async function promptDeployMinio (task, input) {
  return await promptToggle(task, input,
    flags.deployMinio.definition.defaultValue,
    'Would you like to deploy MinIO? ',
    null,
    flags.deployMinio.name)
}

export async function promptDeployCertManager (task, input) {
  return await promptToggle(task, input,
    flags.deployCertManager.definition.defaultValue,
    'Would you like to deploy Cert Manager? ',
    null,
    flags.deployCertManager.name)
}

export async function promptDeployCertManagerCrds (task, input) {
  return await promptToggle(task, input,
    flags.deployCertManagerCrds.definition.defaultValue,
    'Would you like to deploy Cert Manager CRDs? ',
    null,
    flags.deployCertManagerCrds.name)
}

export async function promptDeployMirrorNode (task, input) {
  return await promptToggle(task, input,
    flags.deployMirrorNode.definition.defaultValue,
    'Would you like to deploy Hedera Mirror Node? ',
    null,
    flags.deployMirrorNode.name)
}

export async function promptDeployHederaExplorer (task, input) {
  return await promptToggle(task, input,
    flags.deployHederaExplorer.definition.defaultValue,
    'Would you like to deploy Hedera Explorer? ',
    null,
    flags.deployHederaExplorer.name)
}

export async function promptTlsClusterIssuerType (task, input) {
  try {
    if (!input) {
      input = await task.prompt(ListrEnquirerPromptAdapter).run({
        type: 'text',
        default: flags.tlsClusterIssuerType.definition.defaultValue,
        message: 'Enter TLS cluster issuer type, available options are: "acme-staging", "acme-prod", or "self-signed":'
      })
    }

    if (!input || !['acme-staging', 'acme-prod', 'self-signed'].includes(input)) {
      throw new FullstackTestingError('must be one of: "acme-staging", "acme-prod", or "self-signed"')
    }

    return input
  } catch (e) {
    throw new FullstackTestingError(`input failed: ${flags.tlsClusterIssuerType.name}`, e)
  }
}

export async function promptEnableHederaExplorerTls (task, input) {
  return await promptToggle(task, input,
    flags.enableHederaExplorerTls.definition.defaultValue,
    'Would you like to enable the Hedera Explorer TLS? ',
    null,
    flags.enableHederaExplorerTls.name)
}

export async function promptHederaExplorerTlsHostName (task, input) {
  return await promptText(task, input,
    flags.hederaExplorerTlsHostName.definition.defaultValue,
    'Enter the host name to use for the Hedera Explorer TLS: ',
    null,
    flags.hederaExplorerTlsHostName.name)
}

export async function promptOperatorId (task, input) {
  return await promptText(task, input,
    flags.operatorId.definition.defaultValue,
    'Enter operator ID: ',
    null,
    flags.operatorId.name)
}

export async function promptOperatorKey (task, input) {
  return await promptText(task, input,
    flags.operatorKey.definition.defaultValue,
    'Enter operator private key: ',
    null,
    flags.operatorKey.name)
}

export async function promptReplicaCount (task, input) {
  return await prompt('number', task, input,
    flags.replicaCount.definition.defaultValue,
    'How many replica do you want? ',
    null,
    flags.replicaCount.name)
}

export async function promptGenerateGossipKeys (task, input) {
  return await promptToggle(task, input,
    flags.generateGossipKeys.definition.defaultValue,
    `Would you like to generate Gossip keys? ${typeof input} ${input} `,
    null,
    flags.generateGossipKeys.name)
}

export async function promptGenerateTLSKeys (task, input) {
  return await promptToggle(task, input,
    flags.generateTlsKeys.definition.defaultValue,
    'Would you like to generate TLS keys? ',
    null,
    flags.generateTlsKeys.name)
}

export async function promptDeletePvcs (task, input) {
  return await promptToggle(task, input,
    flags.deletePvcs.definition.defaultValue,
    'Would you like to delete persistent volume claims upon uninstall? ',
    null,
    flags.deletePvcs.name)
}

export async function promptKeyFormat (task, input, choices = [constants.KEY_FORMAT_PFX, constants.KEY_FORMAT_PEM]) {
  try {
    const initial = choices.indexOf(input)
    if (initial < 0) {
      const input = await task.prompt(ListrEnquirerPromptAdapter).run({
        type: 'select',
        initial: choices.indexOf(flags.keyFormat.definition.defaultValue),
        message: 'Select key format',
        choices: helpers.cloneArray(choices)
      })

      if (!input) {
        throw new FullstackTestingError('key-format cannot be empty')
      }

      return input
    }

    return input
  } catch (e) {
    throw new FullstackTestingError(`input failed: ${flags.keyFormat.name}: ${e.message}`, e)
  }
}

export async function promptFstChartVersion (task, input) {
  return await promptText(task, input,
    flags.fstChartVersion.definition.defaultValue,
    'Enter fullstack testing chart version: ',
    null,
    flags.fstChartVersion.name)
}

export async function promptUpdateAccountKeys (task, input) {
  return await promptToggle(task, input,
    flags.updateAccountKeys.definition.defaultValue,
    'Would you like to updates the special account keys to new keys and stores their keys in a corresponding Kubernetes secret? ',
    null,
    flags.updateAccountKeys.name)
}

export async function promptPrivateKey (task, input) {
  return await promptText(task, input,
    flags.privateKey.definition.defaultValue,
    'Enter the private key: ',
    null,
    flags.privateKey.name)
}

export async function promptAccountId (task, input) {
  return await promptText(task, input,
    flags.accountId.definition.defaultValue,
    'Enter the account id: ',
    null,
    flags.accountId.name)
}

export async function promptAmount (task, input) {
  return await prompt('number', task, input,
    flags.amount.definition.defaultValue,
    'How much HBAR do you want to add? ',
    null,
    flags.amount.name)
}

export function getPromptMap () {
  return new Map()
    .set(flags.nodeIDs.name, promptNodeIds)
    .set(flags.releaseTag.name, promptReleaseTag)
    .set(flags.relayReleaseTag.name, promptRelayReleaseTag)
    .set(flags.clusterSetupNamespace.name, promptClusterSetupNamespace)
    .set(flags.namespace.name, promptNamespace)
    .set(flags.cacheDir.name, promptCacheDir)
    .set(flags.force.name, promptForce)
    .set(flags.chainId.name, promptChainId)
    .set(flags.chartDirectory.name, promptChartDir)
    .set(flags.valuesFile.name, promptValuesFile)
    .set(flags.deployPrometheusStack.name, promptDeployPrometheusStack)
    .set(flags.enablePrometheusSvcMonitor.name, promptEnablePrometheusSvcMonitor)
    .set(flags.deployMinio.name, promptDeployMinio)
    .set(flags.deployCertManager.name, promptDeployCertManager)
    .set(flags.deployCertManagerCrds.name, promptDeployCertManagerCrds)
    .set(flags.deployMirrorNode.name, promptDeployMirrorNode)
    .set(flags.deployHederaExplorer.name, promptDeployHederaExplorer)
    .set(flags.tlsClusterIssuerType.name, promptTlsClusterIssuerType)
    .set(flags.enableHederaExplorerTls.name, promptEnableHederaExplorerTls)
    .set(flags.hederaExplorerTlsHostName.name, promptHederaExplorerTlsHostName)
    .set(flags.operatorId.name, promptOperatorId)
    .set(flags.operatorKey.name, promptOperatorKey)
    .set(flags.replicaCount.name, promptReplicaCount)
    .set(flags.generateGossipKeys.name, promptGenerateGossipKeys)
    .set(flags.generateTlsKeys.name, promptGenerateTLSKeys)
    .set(flags.deletePvcs.name, promptDeletePvcs)
    .set(flags.keyFormat.name, promptKeyFormat)
    .set(flags.fstChartVersion.name, promptFstChartVersion)
    .set(flags.updateAccountKeys.name, promptUpdateAccountKeys)
    .set(flags.privateKey.name, promptPrivateKey)
    .set(flags.accountId.name, promptAccountId)
    .set(flags.amount.name, promptAmount)
}

// build the prompt registry
/**
 * Run prompts for the given set of flags
 * @param task task object from listr2
 * @param configManager config manager to store flag values
 * @param flagList list of flag objects
 * @return {Promise<void>}
 */
export async function execute (task, configManager, flagList = []) {
  const prompts = getPromptMap()
  for (const flag of flagList) {
    if (!prompts.has(flag.name)) {
      throw new FullstackTestingError(`No prompt available for flag: ${flag.name}`)
    }

    const prompt = prompts.get(flag.name)
    const input = await prompt(task, configManager.getFlag(flag))
    configManager.setFlag(flag, input)
  }

  configManager.persist()
}
