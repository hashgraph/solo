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
import * as Base64 from 'js-base64'
import { Templates } from './templates.js'
import type { ConfigManager } from './config_manager.ts'
import type { K8 } from './k8.ts'
import type { SoloLogger } from './logging.ts'
import type { ListrTaskWrapper } from 'listr2'
import type { NodeAlias } from '../types/aliases.js'

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

  async copyTlsCertificate (nodeAlias: NodeAlias, grpcTlsCertificatePath: string, grpcWebTlsCertificatePath: string) {
    if (!nodeAlias) throw new MissingArgumentError('nodeAlias is required')
    if (!grpcTlsCertificatePath) throw new MissingArgumentError('tlsCertificatePath is required')
    if (!grpcWebTlsCertificatePath) throw new MissingArgumentError('grpcWebTlsCertificatePath is required')

    try {
      const data: Record<string, string> = {}

      for (const srcFile of [ grpcTlsCertificatePath, grpcWebTlsCertificatePath ]) {
        const fileContents = fs.readFileSync(srcFile)
        const fileName = path.basename(srcFile) // @ts-ignore
        data[fileName] = Base64.encode(fileContents)
      }

      const name = Templates.renderGrpcTlsCertificatesSecretName(nodeAlias)
      const labels = Templates.renderGrpcTlsCertificatesSecretLabelObject(nodeAlias)
      const namespace = this.getNamespace()
      const secretType = 'Opaque'
      const recreate = true

      if (!await this.k8.createSecret(name, namespace, secretType, data, labels, recreate)) {
        throw new SoloError(`failed to create secret for tsc certificates for node '${nodeAlias}'`)
      }
    } catch (e: Error | any) {
      this.logger.error(`failed to copy gossip keys to secret '${Templates.renderGrpcTlsCertificatesSecretName(nodeAlias)}': ${e.message}`, e)
      throw new SoloError(`failed to copy gossip keys to secret '${Templates.renderGrpcTlsCertificatesSecretName(nodeAlias)}': ${e.message}`, e)
    }
  }

  buildCopyTlsCertificatesTasks (
    task: ListrTaskWrapper<any, any, any>,
    grpcTlsCertificatePathsUnparsed: string,
    grpcWebTlsCertificatePathsUnparsed: string
  ) {
    const self = this

    const grpcTlsCertificatePaths = grpcTlsCertificatePathsUnparsed.split(',')
    const grpcWebTlsCertificatePaths = grpcWebTlsCertificatePathsUnparsed.split(',')

    if (grpcTlsCertificatePaths.length !== grpcWebTlsCertificatePaths.length) {
      throw new SoloError('Certificates must have equal length' +
        `, grpcTlsCertificatePaths length: ${grpcTlsCertificatePaths.length}` +
        `, grpcWebTlsCertificatePaths length: ${grpcWebTlsCertificatePaths.length}`)
    }

    const subTasks = []

    for (let i = 0; i < grpcTlsCertificatePaths.length; i++) {
      const [_nodeAlias, grpcTlsCertificatePath] = grpcTlsCertificatePaths[i].split('=')
      const [nodeAlias, grpcWebTlsCertificatePath] = grpcWebTlsCertificatePaths[i].split('=')

      subTasks.push({
        title: `Copy TLS Certificate for node ${nodeAlias}`,
        task: async () => {
          await self.copyTlsCertificate(nodeAlias as NodeAlias, grpcTlsCertificatePath, grpcWebTlsCertificatePath)
        }
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
