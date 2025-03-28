// SPDX-License-Identifier: Apache-2.0

import {MissingArgumentError} from './errors/missing-argument-error.js';
import {SoloError} from './errors/solo-error.js';
import {Flags as flags} from '../commands/flags.js';
import fs from 'fs';
import {Templates} from './templates.js';
import {GrpcProxyTlsEnums} from './enumerations.js';

import {type ConfigManager} from './config-manager.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {type NodeAlias} from '../types/aliases.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {type NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {SecretType} from '../integration/kube/resources/secret/secret-type.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {type SoloListrTaskWrapper} from '../types/index.js';

/**
 * Used to handle interactions with certificates data and inject it into the K8s cluster secrets
 */
@injectable()
export class CertificateManager {
  constructor(
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.ConfigManager) private readonly configManager?: ConfigManager,
  ) {
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
  }

  /**
   * Reads the certificate and key and build the secret with the appropriate structure
   *
   * @param cert - file path to the certificate file
   * @param key - file path to the key file
   * @param type - the certificate type if it's for gRPC or gRPC Web
   *
   * @returns the secret
   */
  private buildSecret(cert: string, key: string, type: GrpcProxyTlsEnums) {
    switch (type) {
      //? HAProxy
      case GrpcProxyTlsEnums.GRPC: {
        const certData = fs.readFileSync(cert).toString();
        const keyData = fs.readFileSync(key).toString();
        const pem = `${certData}\n${keyData}`;

        return {
          'tls.pem': Buffer.from(pem).toString('base64'),
        };
      }

      //? Envoy
      case GrpcProxyTlsEnums.GRPC_WEB: {
        return {
          'tls.crt': fs.readFileSync(cert).toString('base64'),
          'tls.key': fs.readFileSync(key).toString('base64'),
        };
      }
    }
  }

  /**
   * Copies the TLS Certificates into K8s namespaced secret.
   *
   * @param nodeAlias - the alias of the node to which the TLS certificate should apply
   * @param cert - file path to the certificate file
   * @param key - file path to the key file
   * @param type - the certificate type if it's for gRPC or gRPC Web
   */
  private async copyTlsCertificate(nodeAlias: NodeAlias, cert: string, key: string, type: GrpcProxyTlsEnums) {
    try {
      const data: Record<string, string> = this.buildSecret(cert, key, type);
      const name = Templates.renderGrpcTlsCertificatesSecretName(nodeAlias, type);
      const namespace = this.getNamespace();
      const labels = Templates.renderGrpcTlsCertificatesSecretLabelObject(nodeAlias, type);

      const isSecretCreated = await this.k8Factory
        .default()
        .secrets()
        .createOrReplace(namespace, name, SecretType.OPAQUE, data, labels);
      if (!isSecretCreated) {
        throw new SoloError(`failed to create secret for TLS certificates for node '${nodeAlias}'`);
      }
    } catch (e: Error | any) {
      const errorMessage =
        'failed to copy tls certificate to secret ' +
        `'${Templates.renderGrpcTlsCertificatesSecretName(nodeAlias, type)}': ${e.message}`;
      throw new SoloError(errorMessage, e);
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
  public buildCopyTlsCertificatesTasks(
    task: SoloListrTaskWrapper<any>,
    grpcTlsCertificatePathsUnparsed: string,
    grpcWebTlsCertificatePathsUnparsed: string,
    grpcTlsKeyPathsUnparsed: string,
    grpcWebTlsKeyPathsUnparsed: string,
  ) {
    const self = this;
    const subTasks = [];

    const grpcTlsParsedValues = {
      title: 'Copy gRPC TLS Certificate data',
      certType: GrpcProxyTlsEnums.GRPC,
      certs: self.parseAndValidate(grpcTlsCertificatePathsUnparsed, 'gRPC TLS Certificate paths'),
      keys: self.parseAndValidate(grpcTlsKeyPathsUnparsed, 'gRPC TLS Certificate Key paths'),
    };

    const grpcWebTlsParsedValue = {
      certType: GrpcProxyTlsEnums.GRPC_WEB,
      title: 'Copy gRPC Web TLS data',
      certs: self.parseAndValidate(grpcWebTlsCertificatePathsUnparsed, 'gRPC Web TLS Certificate paths'),
      keys: self.parseAndValidate(grpcWebTlsKeyPathsUnparsed, 'gRPC Web Certificate TLS Key paths'),
    };

    if (grpcTlsParsedValues.certs.length !== grpcTlsParsedValues.keys.length) {
      throw new SoloError(
        "The structure of the gRPC TLS Certificate doesn't match" +
          `Certificates: ${grpcTlsCertificatePathsUnparsed}, Keys: ${grpcTlsKeyPathsUnparsed}`,
      );
    }

    if (grpcTlsParsedValues.certs.length !== grpcTlsParsedValues.keys.length) {
      throw new SoloError(
        "The structure of the gRPC Web TLS Certificate doesn't match" +
          `Certificates: ${grpcWebTlsCertificatePathsUnparsed}, Keys: ${grpcWebTlsKeyPathsUnparsed}`,
      );
    }

    for (const {certType, title, certs, keys} of [grpcTlsParsedValues, grpcWebTlsParsedValue]) {
      if (!certs.length) continue;

      for (let i = 0; i < certs.length; i++) {
        const nodeAlias = certs[i].nodeAlias;
        const cert = certs[i].filePath;
        const key = keys[i].filePath;

        subTasks.push({
          title: `${title} for node ${nodeAlias}`,
          task: () => self.copyTlsCertificate(nodeAlias, cert, key, certType),
        });
      }
    }

    return task.newListr(subTasks, {
      concurrent: true,
      rendererOptions: {collapseSubtasks: false},
    });
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
  private parseAndValidate(input: string, type: string): {nodeAlias: NodeAlias; filePath: string}[] {
    return input.split(',').map((line, i) => {
      if (!line.includes('=')) {
        throw new SoloError(`Failed to parse input ${input} of type ${type} on ${line}, index ${i}`);
      }

      const [nodeAlias, filePath] = line.split('=') as [NodeAlias, string];
      if (!nodeAlias?.length || !filePath?.length) {
        throw new SoloError(`Failed to parse input ${input} of type ${type} on ${line}, index ${i}`);
      }

      let fileExists = false;
      try {
        fileExists = fs.statSync(filePath).isFile();
      } catch {
        fileExists = false;
      }
      if (!fileExists) {
        throw new SoloError(`File doesn't exist on path ${input} input of type ${type} on ${line}, index ${i}`);
      }

      return {nodeAlias, filePath};
    });
  }

  private getNamespace() {
    const ns = this.configManager.getFlag<NamespaceName>(flags.namespace);
    if (!ns) throw new MissingArgumentError('namespace is not set');
    return ns;
  }
}
