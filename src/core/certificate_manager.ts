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
import path from 'path'
import { Templates } from './templates.ts'
import { CertificateTypes } from './enumerations.ts'

import type { ConfigManager } from './config_manager.ts'
import type { K8 } from './k8.ts'
import type { SoloLogger } from './logging.ts'
import type { ListrTaskWrapper } from 'listr2'
import type { NodeAlias } from '../types/aliases.ts'

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

  // Validates and Copies the certificates into K8s secret
  async copyTlsCertificate (nodeAlias: NodeAlias, cert: string, type: CertificateTypes) {
    if (!nodeAlias) throw new MissingArgumentError('nodeAlias is required')
    if (!cert) throw new MissingArgumentError('cert is required')
    if (!fs.statSync(cert).isFile()) throw new MissingArgumentError(`certificate path doesn't exists - ${cert}`)
    try {
      const data = { [nodeAlias]: fs.readFileSync(cert).toString('base64') }
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

  // Creates subtasks for copying the certificates into K8s secrets
  buildCopyTlsCertificatesTasks (
    task: ListrTaskWrapper<any, any, any>,
    grpcTlsCertificatePathsUnparsed: string,
    grpcWebTlsCertificatePathsUnparsed: string
  ) {
    const self = this
    const subTasks = []

    for (const path of grpcTlsCertificatePathsUnparsed.split(',')) {
      const [nodeAlias, cert] = path.split('=')
      subTasks.push({
        title: `Copy gRPC Web TLS Certificate for node ${nodeAlias}`,
        task: () => self.copyTlsCertificate(nodeAlias as NodeAlias, cert, CertificateTypes.GRPC)
      })
    }

    for (const path of grpcWebTlsCertificatePathsUnparsed.split(',')) {
      const [nodeAlias, cert] = path.split('=')
      subTasks.push({
        title: `Copy gRPC Web TLS Certificate for node ${nodeAlias}`,
        task: () => self.copyTlsCertificate(nodeAlias as NodeAlias, cert, CertificateTypes.GRPC_WEB)
      })
    }

    return task.newListr(subTasks, {
      concurrent: true,
      rendererOptions: { collapseSubtasks: false }
    })
  }

  private getNamespace () {
    const ns = this.configManager.getFlag<string>(flags.namespace) as string
    if (!ns) throw new MissingArgumentError('namespace is not set')
    return ns
  }
}
