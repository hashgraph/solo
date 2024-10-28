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

  // Validates and Copies the certificates into K8s secrets
  async copyTlsCertificate (nodeAlias: NodeAlias, grpcCert: string, grpcWebCert: string) {
    if (!nodeAlias) throw new MissingArgumentError('nodeAlias is required')
    if (!grpcCert) throw new MissingArgumentError('tlsCertificatePath is required')
    if (!grpcWebCert) throw new MissingArgumentError('grpcWebCert is required')

    console.log('-------------- 1 -------------- ')

    // if (!fs.statSync(grpcCert).isFile()) {
    //   throw new MissingArgumentError(`gRPC certificate path doesn't exists - ${grpcCert}`)
    // }
    // if (!fs.statSync(grpcWebCert).isFile()) {
    //   throw new MissingArgumentError(`gRPC Web certificate path doesn't exists - ${grpcWebCert}`)
    // }

    try {
      const data: Record<string, string> = {}

      console.log('-------------- 2 -------------- ')

      for (const srcFile of [ grpcCert, grpcWebCert ]) {

        console.log(`-------------- ${srcFile} 1 -------------- `)

        const fileContents = fs.readFileSync(srcFile).toString('base64')

        console.log(`-------------- ${srcFile} 2 -------------- `)

        const fileName = path.basename(srcFile) // @ts-ignore
        data[fileName] = fileContents
      }

      const name = Templates.renderGrpcTlsCertificatesSecretName(nodeAlias)
      const labels = Templates.renderGrpcTlsCertificatesSecretLabelObject(nodeAlias)
      const namespace = this.getNamespace()
      const secretType = 'Opaque'
      const recreate = true

      console.log(`-------------- 3 -------------- `)

      if (!await this.k8.createSecret(name, namespace, secretType, data, labels, recreate)) {
        throw new SoloError(`failed to create secret for tsc certificates for node '${nodeAlias}'`)
      }

      console.log(`-------------- 4 -------------- `)
    } catch (e: Error | any) {
      const errorMessage = 'failed to copy tls certificate to secret ' +
        `'${Templates.renderGrpcTlsCertificatesSecretName(nodeAlias)}': ${e.message}`

      console.error(errorMessage, e)

      this.logger.error(errorMessage, e)
      throw new SoloError(errorMessage, e)
    }
  }

  // Creates tasks for copying the certificates into K8s secrets
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
      const [_nodeAlias, grpcCert] = grpcTlsCertificatePaths[i].split('=')
      const [nodeAlias, grpcWebCert] = grpcWebTlsCertificatePaths[i].split('=')

      subTasks.push({
        title: `Copy TLS Certificate for node ${nodeAlias}`,
        task: async () => {
          await self.copyTlsCertificate(nodeAlias as NodeAlias, grpcCert, grpcWebCert)
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
