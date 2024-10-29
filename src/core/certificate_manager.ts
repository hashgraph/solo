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
import { MissingArgumentError, SoloError } from './errors.ts'
import { flags } from '../commands/index.ts'
import fs from 'fs'
import { Templates } from './templates.ts'
import { GrpcProxyCertificateEnums } from './enumerations.ts'

import type { ConfigManager } from './config_manager.ts'
import type { K8 } from './k8.ts'
import type { SoloLogger } from './logging.ts'
import type { ListrTaskWrapper } from 'listr2'
import type { NodeAlias } from '../types/aliases.ts'

/**
 * Used to handle interactions with certificates data and inject it into the K8s cluster secrets
 */
export class CertificateManager {
  constructor (
    private readonly k8: K8,
    private readonly logger: SoloLogger,
    private readonly configManager: ConfigManager
  ) {
    if (!k8) throw new MissingArgumentError('an instance of core/K8 is required')
    if (!logger) throw new MissingArgumentError('an instance of core/SoloLogger is required')
    if (!configManager) throw new MissingArgumentError('an instance of core/ConfigManager is required')
  }

  /**
   * Copies the TLS Certificates into K8s namespaced secret.
   *
   * @param nodeAlias - the alias of the node to which the TLS certificate should apply
   * @param filePath - file path to the certificate or file
   * @param type - the certificate type if it's for gRPC or  gRPC Web and certificate or key
   */
  private async copyTlsCertificate (nodeAlias: NodeAlias, filePath: string, type: GrpcProxyCertificateEnums) {
    try {
      const data = { [nodeAlias]: fs.readFileSync(filePath).toString('base64') }
      const name = Templates.renderGrpcTlsCertificatesSecretName(nodeAlias, type)
      const namespace = this.getNamespace()
      const labels = Templates.renderGrpcTlsCertificatesSecretLabelObject(nodeAlias, type)

      const isSecretCreated = await this.k8.createSecret(name, namespace, 'Opaque', data, labels, true)
      if (!isSecretCreated) {
        throw new SoloError(`failed to create secret for tsc certificates for node '${nodeAlias}'`)
      }
    } catch (e: Error | any) {
      const errorMessage = 'failed to copy tls certificate to secret ' +
        `'${Templates.renderGrpcTlsCertificatesSecretName(nodeAlias, type)}': ${e.message}`
      this.logger.error(errorMessage, e)
      throw new SoloError(errorMessage, e)
    }
  }

  /**
   * Creates sub-tasks for copying the TLS Certificates into K8s secrets for gRPC and gRPC Web
   *
   * @param task - Listr Task to which to attach the sub-tasks
   * @param grpcTlsCertificatePathsUnparsed - the unparsed (alias=path)[] for the gRPC Certificate
   * @param grpcWebTlsCertificatePathsUnparsed - the unparsed (alias=path)[] for the gRPC Web Certificate
   * @param grpcTlsKeyPathsUnparsed - the unparsed (alias=path)[] for the gRPC Certificate Key
   * @param grpcWebTlsKeyPathsUnparsed - the unparsed (alias=path)[] for the gRPC Web Certificate Key
   *
   * @returns the build sub-tasks for creating the secrets
   */
  public buildCopyTlsCertificatesTasks (
    task: ListrTaskWrapper<any, any, any>,
    grpcTlsCertificatePathsUnparsed: string,
    grpcWebTlsCertificatePathsUnparsed: string,
    grpcTlsKeyPathsUnparsed: string,
    grpcWebTlsKeyPathsUnparsed: string
  ) {
    const self = this
    const subTasks = []

    const parsedPaths = [
      {
        paths: self.parseAndValidate(grpcTlsCertificatePathsUnparsed, 'gRPC TLS Certificate paths'),
        certType: GrpcProxyCertificateEnums.CERTIFICATE,
        title: 'Copy gRPC TLS Certificate'
      },
      {
        paths: self.parseAndValidate(grpcWebTlsCertificatePathsUnparsed, 'gRPC Web TLS Certificate paths'),
        certType: GrpcProxyCertificateEnums.WEB_CERTIFICATE,
        title: 'Copy gRPC Web TLS Certificate'
      },
      {
        paths: self.parseAndValidate(grpcTlsKeyPathsUnparsed, 'gRPC TLS Certificate Key paths'),
        certType: GrpcProxyCertificateEnums.CERTIFICATE_KEY,
        title: 'Copy gRPC TLS Certificate Key'
      },
      {
        paths: self.parseAndValidate(grpcWebTlsKeyPathsUnparsed, 'gRPC Web Certificate TLS Key paths'),
        certType: GrpcProxyCertificateEnums.WEB_CERTIFICATE_KEY,
        title: 'Copy gRPC Web TLS Certificate Key'
      }
    ]

    for (const { paths, certType, title } of parsedPaths) {
      for (const { nodeAlias, filePath } of paths) {
        subTasks.push({
          title: `${title} for node ${nodeAlias}`,
          task: () => self.copyTlsCertificate(nodeAlias, filePath, certType)
        })
      }
    }

    return task.newListr(subTasks, {
      concurrent: true,
      rendererOptions: { collapseSubtasks: false }
    })
  }

  /**
   * Handles parsing the unparsed data validating it follows the structure
   *
   * @param input - the unparsed data ( ex. node0=/usr/bob/grpc-web.cert )
   * @param type - of the data being parsed for the error logging
   *
   * @returns an array of parsed data with node alias and the path
   *
   * @throws SoloError - if the data doesn't follow the structure
   */
  private parseAndValidate (input: string, type: string): {nodeAlias: NodeAlias, filePath: string}[] {
    return input.split(',').map((line, index) => {
      if (!line.includes('=')) {
        throw new SoloError(
          `Failed to parse input ${input} of type ${type}. Invalid structure on line ${line}, index ${index}`
        )
      }

      const [nodeAlias, filePath] = line.split('=') as [NodeAlias, string]

      if (!nodeAlias?.length || !filePath?.length) {
        throw new SoloError(
          `Failed to parse input ${input} of type ${type}. Invalid structure on line ${line}, index ${index}`
        )
      }
      let fileExists = false

      try { fileExists = fs.statSync(filePath).isFile() } catch {}

      if (!fileExists) {
        throw new SoloError(
          `File doesn't exist on path ${filePath} ${input} input of type ${type} on line ${line}, index ${index}`
        )
      }

      return { nodeAlias, filePath }
    })
  }

  private getNamespace () {
    const ns = this.configManager.getFlag<string>(flags.namespace) as string
    if (!ns) throw new MissingArgumentError('namespace is not set')
    return ns
  }
}
