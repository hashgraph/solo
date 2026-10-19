// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from './errors/solo-errors.js';
import {Flags as flags} from '../commands/flags.js';
import fs from 'node:fs';
import {Templates} from './templates.js';
import {GrpcProxyTlsEnums} from './enumerations.js';

import {type ConfigManager} from './config-manager.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {AnyListrContext, type NodeAlias} from '../types/aliases.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {SecretType} from '../integration/kube/resources/secret/secret-type.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {SoloListr, type SoloListrTaskWrapper} from '../types/index.js';

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
        const certData: string = fs.readFileSync(cert).toString();
        const keyData: string = fs.readFileSync(key).toString();
        const pem: string = `${certData}\n${keyData}`;

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
  private async copyTlsCertificate(
    nodeAlias: NodeAlias,
    cert: string,
    key: string,
    type: GrpcProxyTlsEnums,
  ): Promise<void> {
    try {
      const data: Record<string, string> = this.buildSecret(cert, key, type);
      const name: string = Templates.renderGrpcTlsCertificatesSecretName(nodeAlias, type);
      const namespace: NamespaceName = this.getNamespace();
      const labels: Record<string, string> = Templates.renderGrpcTlsCertificatesSecretLabelObject(nodeAlias, type);

      const isSecretCreated: boolean = await this.k8Factory
        .default()
        .secrets()
        .createOrReplace(namespace, name, SecretType.OPAQUE, data, labels);
      if (!isSecretCreated) {
        throw new SoloErrors.component.certificateSecretCreationFailed(nodeAlias);
      }
    } catch (error) {
      throw new SoloErrors.component.certificateSecretCreationFailed(nodeAlias, error);
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
  ): SoloListr<AnyListrContext> {
    const subTasks = [];

    const grpcTlsParsedValues = {
      title: 'Copy gRPC TLS Certificate data',
      certType: GrpcProxyTlsEnums.GRPC,
      certs: this.parseAndValidate(grpcTlsCertificatePathsUnparsed, 'gRPC TLS Certificate paths'),
      keys: this.parseAndValidate(grpcTlsKeyPathsUnparsed, 'gRPC TLS Certificate Key paths'),
    };

    const grpcWebTlsParsedValue = {
      certType: GrpcProxyTlsEnums.GRPC_WEB,
      title: 'Copy gRPC Web TLS data',
      certs: this.parseAndValidate(grpcWebTlsCertificatePathsUnparsed, 'gRPC Web TLS Certificate paths'),
      keys: this.parseAndValidate(grpcWebTlsKeyPathsUnparsed, 'gRPC Web Certificate TLS Key paths'),
    };

    if (grpcTlsParsedValues.certs.length !== grpcTlsParsedValues.keys.length) {
      throw new SoloErrors.component.grpcTlsCertMismatch(grpcTlsCertificatePathsUnparsed, grpcTlsKeyPathsUnparsed);
    }

    if (grpcTlsParsedValues.certs.length !== grpcTlsParsedValues.keys.length) {
      throw new SoloErrors.component.grpcWebTlsCertMismatch(
        grpcWebTlsCertificatePathsUnparsed,
        grpcWebTlsKeyPathsUnparsed,
      );
    }

    for (const {certType, title, certs, keys} of [grpcTlsParsedValues, grpcWebTlsParsedValue]) {
      if (certs.length === 0) {
        continue;
      }

      for (const [index, cert_] of certs.entries()) {
        const nodeAlias: NodeAlias = cert_.nodeAlias;
        const cert: string = cert_.filePath;
        const key: string = keys[index].filePath;

        subTasks.push({
          title: `${title} for node ${nodeAlias}`,
          task: () => this.copyTlsCertificate(nodeAlias, cert, key, certType),
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
    return input.split(',').map((line, index) => {
      if (!line.includes('=')) {
        throw new SoloErrors.component.certificateParsingFailed(input, type, line as unknown as number, index);
      }

      const [nodeAlias, filePath] = line.split('=') as [NodeAlias, string];
      if (!nodeAlias?.length || !filePath?.length) {
        throw new SoloErrors.component.certificateParsingFailed(input, type, line as unknown as number, index);
      }

      let fileExists = false;
      try {
        fileExists = fs.statSync(filePath).isFile();
      } catch {
        fileExists = false;
      }
      if (!fileExists) {
        throw new SoloErrors.component.certificateFileNotFound(input, type, line as unknown as number, index);
      }

      return {nodeAlias, filePath};
    });
  }

  private getNamespace() {
    const ns = this.configManager.getFlag<NamespaceName>(flags.namespace);
    if (!ns) {
      throw new SoloErrors.validation.missingArgument('namespace is not set');
    }
    return ns;
  }
}
