// SPDX-License-Identifier: Apache-2.0

import * as x509 from '@peculiar/x509';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {SoloError} from './errors/solo-error.js';
import {IllegalArgumentError} from './errors/illegal-argument-error.js';
import {MissingArgumentError} from './errors/missing-argument-error.js';
import * as constants from './constants.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {Templates} from './templates.js';
import * as helpers from './helpers.js';
import chalk from 'chalk';
import {type NodeAlias, type NodeAliases} from '../types/aliases.js';
import {type NodeKeyObject, type PrivateKeyAndCertificateObject, type SoloListrTask} from '../types/index.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {PathEx} from '../business/utils/path-ex.js';
import {NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {SecretType} from '../integration/kube/resources/secret/secret-type.js';
import * as selfsigned from 'selfsigned';

// @ts-ignore
x509.cryptoProvider.set(crypto);

@injectable()
export class KeyManager {
  static SigningKeyAlgo = {
    name: 'RSASSA-PKCS1-v1_5',
    hash: 'SHA-384',
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 3072,
  };

  static SigningKeyUsage: KeyUsage[] = ['sign', 'verify'];

  static TLSKeyAlgo = {
    name: 'RSASSA-PKCS1-v1_5',
    hash: 'SHA-384',
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 4096,
  };

  static TLSKeyUsage: KeyUsage[] = ['sign', 'verify'];
  static TLSCertKeyUsages =
    x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment | x509.KeyUsageFlags.dataEncipherment;

  static TLSCertKeyExtendedUsages = [x509.ExtendedKeyUsage.serverAuth, x509.ExtendedKeyUsage.clientAuth];

  static ECKeyAlgo = {
    name: 'ECDSA',
    namedCurve: 'P-384',
    hash: 'SHA-384',
  };

  constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  /** Convert CryptoKey into PEM string */
  async convertPrivateKeyToPem(privateKey: CryptoKey) {
    const ab = await crypto.subtle.exportKey('pkcs8', privateKey);
    return x509.PemConverter.encode(ab, 'PRIVATE KEY');
  }

  /**
   * Convert PEM private key into CryptoKey
   * @param pemStr - PEM string
   * @param algo - key algorithm
   * @param [keyUsages]
   */
  async convertPemToPrivateKey(pemString: string, algo: any, keyUsages: KeyUsage[] = ['sign']) {
    if (!algo) {
      throw new MissingArgumentError('algo is required');
    }

    const items = x509.PemConverter.decode(pemString);

    // Since pem file may include multiple PEM data, the decoder returns an array
    // However for private key there should be a single item.
    // So, we just being careful here to pick the last item (similar to how last PEM data represents the actual cert in
    // a certificate bundle)
    const lastItem = items.at(-1);

    return await crypto.subtle.importKey('pkcs8', lastItem, algo, false, keyUsages);
  }

  /**
   * Return file names for node key
   * @param nodeAlias
   * @param keysDirectory - directory where keys and certs are stored
   */
  prepareNodeKeyFilePaths(nodeAlias: NodeAlias, keysDirectory: string): PrivateKeyAndCertificateObject {
    if (!nodeAlias) {
      throw new MissingArgumentError('nodeAlias is required');
    }
    if (!keysDirectory) {
      throw new MissingArgumentError('keysDirectory is required');
    }

    const keyFile = PathEx.join(keysDirectory, Templates.renderGossipPemPrivateKeyFile(nodeAlias));
    const certFile = PathEx.join(keysDirectory, Templates.renderGossipPemPublicKeyFile(nodeAlias));

    return {
      privateKeyFile: keyFile,
      certificateFile: certFile,
    };
  }

  /**
   * Return file names for TLS key
   * @param nodeAlias
   * @param keysDirectory - directory where keys and certs are stored
   */
  prepareTLSKeyFilePaths(nodeAlias: NodeAlias, keysDirectory: string): PrivateKeyAndCertificateObject {
    if (!nodeAlias) {
      throw new MissingArgumentError('nodeAlias is required');
    }
    if (!keysDirectory) {
      throw new MissingArgumentError('keysDirectory is required');
    }

    const keyFile = PathEx.join(keysDirectory, `hedera-${nodeAlias}.key`);
    const certFile = PathEx.join(keysDirectory, `hedera-${nodeAlias}.crt`);

    return {
      privateKeyFile: keyFile,
      certificateFile: certFile,
    };
  }

  /**
   * Store node keys and certs as PEM files
   * @param nodeAlias
   * @param nodeKey
   * @param keysDirectory - directory where keys and certs are stored
   * @param nodeKeyFiles
   * @param [keyName] - optional key type name for logging
   * @returns a Promise that saves the keys and certs as PEM files
   */
  async storeNodeKey(
    nodeAlias: NodeAlias,
    nodeKey: NodeKeyObject,
    keysDirectory: string,
    nodeKeyFiles: PrivateKeyAndCertificateObject,
    keyName = '',
  ): Promise<PrivateKeyAndCertificateObject> {
    if (!nodeAlias) {
      throw new MissingArgumentError('nodeAlias is required');
    }

    if (!nodeKey || !nodeKey.privateKey) {
      throw new MissingArgumentError('nodeKey.ed25519PrivateKey is required');
    }

    if (!nodeKey || !nodeKey.certificateChain) {
      throw new MissingArgumentError('nodeKey.certificateChain is required');
    }

    if (!keysDirectory) {
      throw new MissingArgumentError('keysDirectory is required');
    }

    if (!nodeKeyFiles || !nodeKeyFiles.privateKeyFile) {
      throw new MissingArgumentError('nodeKeyFiles.privateKeyFile is required');
    }

    if (!nodeKeyFiles || !nodeKeyFiles.certificateFile) {
      throw new MissingArgumentError('nodeKeyFiles.certificateFile is required');
    }

    const keyPem = await this.convertPrivateKeyToPem(nodeKey.privateKey);
    const certPems: string[] = [];
    for (const cert of nodeKey.certificateChain) {
      certPems.push(cert.toString('pem'));
    }

    const self = this;
    return new Promise((resolve, reject) => {
      try {
        this.logger.debug(`Storing ${keyName} key for node: ${nodeAlias}`, {nodeKeyFiles});

        fs.writeFileSync(nodeKeyFiles.privateKeyFile, keyPem);

        // remove if the certificate file exists already as otherwise we'll keep appending to the last
        if (fs.existsSync(nodeKeyFiles.certificateFile)) {
          fs.rmSync(nodeKeyFiles.certificateFile);
        }

        for (const certPem of certPems) {
          fs.writeFileSync(nodeKeyFiles.certificateFile, certPem + '\n', {flag: 'a'});
        }

        self.logger.debug(`Stored ${keyName} key for node: ${nodeAlias}`, {
          nodeKeyFiles,
        });

        resolve(nodeKeyFiles);
      } catch (error: Error | any) {
        reject(error);
      }
    });
  }

  /**
   * Load node keys and certs from PEM files
   * @param nodeAlias
   * @param keysDirectory - directory where keys and certs are stored
   * @param algo - algorithm used for key
   * @param nodeKeyFiles an object stores privateKeyFile and certificateFile
   * @param [keyName] - optional key type name for logging
   * @returns
   */
  async loadNodeKey(
    nodeAlias: NodeAlias,
    keysDirectory: string,
    algo: any,
    nodeKeyFiles: PrivateKeyAndCertificateObject,
    keyName = '',
  ): Promise<NodeKeyObject> {
    if (!nodeAlias) {
      throw new MissingArgumentError('nodeAlias is required');
    }

    if (!keysDirectory) {
      throw new MissingArgumentError('keysDirectory is required');
    }

    if (!algo) {
      throw new MissingArgumentError('algo is required');
    }

    if (!nodeKeyFiles || !nodeKeyFiles.privateKeyFile) {
      throw new MissingArgumentError('nodeKeyFiles.privateKeyFile is required');
    }

    if (!nodeKeyFiles || !nodeKeyFiles.certificateFile) {
      throw new MissingArgumentError('nodeKeyFiles.certificateFile is required');
    }

    this.logger.debug(`Loading ${keyName}-keys for node: ${nodeAlias}`, {nodeKeyFiles});

    const keyBytes = fs.readFileSync(nodeKeyFiles.privateKeyFile);
    const keyPem = keyBytes.toString();
    const key = await this.convertPemToPrivateKey(keyPem, algo);

    const certBytes = fs.readFileSync(nodeKeyFiles.certificateFile);
    const certPems = x509.PemConverter.decode(certBytes.toString());

    const certs: x509.X509Certificate[] = [];
    for (const certPem of certPems) {
      const cert = new x509.X509Certificate(certPem);
      certs.push(cert);
    }

    const certChain = await new x509.X509ChainBuilder({certificates: certs.slice(1)}).build(certs[0]);

    this.logger.debug(`Loaded ${keyName}-key for node: ${nodeAlias}`, {
      nodeKeyFiles,
      cert: certs[0].toString('pem'),
    });
    return {
      privateKey: key,
      certificate: certs[0],
      certificateChain: certChain,
    };
  }

  /** Generate signing key and certificate */
  async generateSigningKey(nodeAlias: NodeAlias): Promise<NodeKeyObject> {
    try {
      const keyPrefix = constants.SIGNING_KEY_PREFIX;
      const currentDate = new Date();
      const friendlyName = Templates.renderNodeFriendlyName(keyPrefix, nodeAlias);

      this.logger.debug(`generating ${keyPrefix}-key for node: ${nodeAlias}`, {friendlyName});

      const keypair = await crypto.subtle.generateKey(KeyManager.SigningKeyAlgo, true, KeyManager.SigningKeyUsage);

      const cert = await x509.X509CertificateGenerator.createSelfSigned({
        serialNumber: '01',
        name: `CN=${friendlyName}`,
        notBefore: currentDate,
        // @ts-ignore
        notAfter: new Date().setFullYear(currentDate.getFullYear() + constants.CERTIFICATE_VALIDITY_YEARS),
        keys: keypair,
        extensions: [
          new x509.BasicConstraintsExtension(true, 1, true),
          new x509.ExtendedKeyUsageExtension(
            [x509.ExtendedKeyUsage.serverAuth, x509.ExtendedKeyUsage.clientAuth],
            true,
          ),
          new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
          await x509.SubjectKeyIdentifierExtension.create(keypair.publicKey),
        ],
      });

      const certChain = await new x509.X509ChainBuilder().build(cert);

      this.logger.debug(`generated ${keyPrefix}-key for node: ${nodeAlias}`, {cert: cert.toString('pem')});

      return {
        privateKey: keypair.privateKey,
        certificate: cert,
        certificateChain: certChain,
      };
    } catch (error: Error | any) {
      throw new SoloError(`failed to generate signing key: ${error.message}`, error);
    }
  }

  /**
   * Store signing key and certificate
   * @param nodeAlias
   * @param nodeKey - an object containing privateKeyPem, certificatePem data
   * @param keysDirectory - directory where keys and certs are stored
   * @returns returns a Promise that saves the keys and certs as PEM files
   */
  storeSigningKey(nodeAlias: NodeAlias, nodeKey: NodeKeyObject, keysDirectory: string) {
    const nodeKeyFiles = this.prepareNodeKeyFilePaths(nodeAlias, keysDirectory);
    return this.storeNodeKey(nodeAlias, nodeKey, keysDirectory, nodeKeyFiles, 'signing');
  }

  /**
   * Load signing key and certificate
   * @param nodeAlias
   * @param keysDirectory - directory path where pem files are stored
   */
  loadSigningKey(nodeAlias: NodeAlias, keysDirectory: string) {
    const nodeKeyFiles = this.prepareNodeKeyFilePaths(nodeAlias, keysDirectory);
    return this.loadNodeKey(nodeAlias, keysDirectory, KeyManager.SigningKeyAlgo, nodeKeyFiles, 'signing');
  }

  /**
   * Generate gRPC TLS key
   *
   * It generates TLS keys in PEM format such as below:
   *  hedera-<nodeAlias>.key
   *  hedera-<nodeAlias>.crt
   *
   * @param nodeAlias
   * @param distinguishedName distinguished name as: new x509.Name(`CN=${nodeAlias},ST=${state},L=${locality},O=${org},OU=${orgUnit},C=${country}`)
   */
  async generateGrpcTlsKey(
    nodeAlias: NodeAlias,
    distinguishedName: x509.Name = new x509.Name(`CN=${nodeAlias}`),
  ): Promise<NodeKeyObject> {
    if (!nodeAlias) {
      throw new MissingArgumentError('nodeAlias is required');
    }
    if (!distinguishedName) {
      throw new MissingArgumentError('distinguishedName is required');
    }

    try {
      const currentDate = new Date();

      this.logger.debug(`generating gRPC TLS for node: ${nodeAlias}`, {distinguishedName});

      const keypair = await crypto.subtle.generateKey(KeyManager.TLSKeyAlgo, true, KeyManager.TLSKeyUsage);

      const cert = await x509.X509CertificateGenerator.createSelfSigned({
        serialNumber: '01',
        name: distinguishedName,
        notBefore: currentDate,
        // @ts-ignore
        notAfter: new Date().setFullYear(currentDate.getFullYear() + constants.CERTIFICATE_VALIDITY_YEARS),
        keys: keypair,
        extensions: [
          new x509.BasicConstraintsExtension(false, 0, true),
          new x509.KeyUsagesExtension(KeyManager.TLSCertKeyUsages, true),
          new x509.ExtendedKeyUsageExtension(KeyManager.TLSCertKeyExtendedUsages, true),
          await x509.SubjectKeyIdentifierExtension.create(keypair.publicKey, false),
          await x509.AuthorityKeyIdentifierExtension.create(keypair.publicKey, false),
        ],
      });

      const certChain = await new x509.X509ChainBuilder().build(cert);

      this.logger.debug(`generated gRPC TLS for node: ${nodeAlias}`, {cert: cert.toString('pem')});

      return {
        privateKey: keypair.privateKey,
        certificate: cert,
        certificateChain: certChain,
      };
    } catch (error: Error | any) {
      throw new SoloError(`failed to generate gRPC TLS key: ${error.message}`, error);
    }
  }

  /**
   * Store TLS key and certificate
   * @param nodeAlias
   * @param nodeKey
   * @param keysDirectory - directory where keys and certs are stored
   * @returns a Promise that saves the keys and certs as PEM files
   */
  storeTLSKey(nodeAlias: NodeAlias, nodeKey: NodeKeyObject, keysDirectory: string) {
    const nodeKeyFiles = this.prepareTLSKeyFilePaths(nodeAlias, keysDirectory);
    return this.storeNodeKey(nodeAlias, nodeKey, keysDirectory, nodeKeyFiles, 'gRPC TLS');
  }

  /**
   * Load TLS key and certificate
   * @param nodeAlias
   * @param keysDirectory - directory path where pem files are stored
   */
  loadTLSKey(nodeAlias: NodeAlias, keysDirectory: string) {
    const nodeKeyFiles = this.prepareTLSKeyFilePaths(nodeAlias, keysDirectory);
    return this.loadNodeKey(nodeAlias, keysDirectory, KeyManager.TLSKeyAlgo, nodeKeyFiles, 'gRPC TLS');
  }

  copyNodeKeysToStaging(nodeKey: PrivateKeyAndCertificateObject, destinationDirectory: string) {
    for (const keyFile of [nodeKey.privateKeyFile, nodeKey.certificateFile]) {
      if (!fs.existsSync(keyFile)) {
        throw new SoloError(`file (${keyFile}) is missing`);
      }

      const fileName = path.basename(keyFile);
      fs.cpSync(keyFile, PathEx.join(destinationDirectory, fileName));
    }
  }

  copyGossipKeysToStaging(keysDirectory: string, stagingKeysDirectory: string, nodeAliases: NodeAliases) {
    // copy gossip keys to the staging
    for (const nodeAlias of nodeAliases) {
      const signingKeyFiles = this.prepareNodeKeyFilePaths(nodeAlias, keysDirectory);
      this.copyNodeKeysToStaging(signingKeyFiles, stagingKeysDirectory);
    }
  }

  /**
   * Return a list of subtasks to generate gossip keys
   *
   * WARNING: These tasks MUST run in sequence.
   *
   * @param nodeAliases
   * @param keysDirectory - keys directory
   * @param curDate - current date
   * @param [allNodeAliases] - includes the nodeAliases to get new keys as well as existing nodeAliases that will be included in the public.pfx file
   * @returns a list of subtasks
   */
  taskGenerateGossipKeys(
    nodeAliases: NodeAliases,
    keysDirectory: string,
    currentDate = new Date(),
    allNodeAliases: NodeAliases | null = null,
  ) {
    allNodeAliases = allNodeAliases || nodeAliases; // TODO: unused variable
    if (!Array.isArray(nodeAliases) || !nodeAliases.every(nodeAlias => typeof nodeAlias === 'string')) {
      throw new IllegalArgumentError(
        'nodeAliases must be an array of strings, nodeAliases = ' + JSON.stringify(nodeAliases),
      );
    }
    const self = this;
    const subTasks: SoloListrTask<any>[] = [];

    subTasks.push({
      title: 'Backup old files',
      task: () => helpers.backupOldPemKeys(nodeAliases, keysDirectory, currentDate),
    });

    for (const nodeAlias of nodeAliases) {
      subTasks.push({
        title: `Gossip key for node: ${chalk.yellow(nodeAlias)}`,
        task: async () => {
          const signingKey = await self.generateSigningKey(nodeAlias);
          const signingKeyFiles = await self.storeSigningKey(nodeAlias, signingKey, keysDirectory);
          this.logger.debug(`generated Gossip signing keys for node ${nodeAlias}`, {keyFiles: signingKeyFiles});
        },
      });
    }
    return subTasks;
  }

  /**
   *  Return a list of subtasks to generate gRPC TLS keys
   *
   * WARNING: These tasks should run in sequence
   *
   * @param nodeAliases
   * @param keysDirectory keys directory
   * @param curDate current date
   * @returns return a list of subtasks
   */
  taskGenerateTLSKeys(nodeAliases: NodeAliases, keysDirectory: string, currentDate = new Date()) {
    // check if nodeAliases is an array of strings
    if (!Array.isArray(nodeAliases) || !nodeAliases.every(nodeAlias => typeof nodeAlias === 'string')) {
      throw new SoloError('nodeAliases must be an array of strings');
    }
    const self = this;
    const nodeKeyFiles = new Map();
    const subTasks: SoloListrTask<any>[] = [];

    subTasks.push({
      title: 'Backup old files',
      task: () => helpers.backupOldTlsKeys(nodeAliases, keysDirectory, currentDate),
    });

    for (const nodeAlias of nodeAliases) {
      subTasks.push({
        title: `TLS key for node: ${chalk.yellow(nodeAlias)}`,
        task: async () => {
          const tlsKey = await self.generateGrpcTlsKey(nodeAlias);
          const tlsKeyFiles = await self.storeTLSKey(nodeAlias, tlsKey, keysDirectory);
          nodeKeyFiles.set(nodeAlias, {
            tlsKeyFiles,
          });
        },
      });
    }

    return subTasks;
  }

  /**
   * Given the path to the PEM certificate (Base64 ASCII), will return the DER (raw binary) bytes
   * @param pemCertFullPath
   */
  getDerFromPemCertificate(pemCertFullPath: string) {
    const certPem = fs.readFileSync(pemCertFullPath).toString();
    const decodedDers = x509.PemConverter.decode(certPem);
    if (!decodedDers || decodedDers.length === 0) {
      throw new SoloError('unable to load perm key: ' + pemCertFullPath);
    }
    return new Uint8Array(decodedDers[0]);
  }

  /**
   * Creates a TLS secret in Kubernetes for the Explorer
   * @param k8Factory Kubernetes factory instance
   * @param namespace Namespace to create the secret in
   * @param domainName Domain name for the TLS certificate
   * @param cacheDirectory Directory to store temporary files
   * @param secretName Name of the secret to create
   * @returns Promise<void>
   */
  public static async createTlsSecret(
    k8Factory: K8Factory,
    namespace: NamespaceName,
    domainName: string,
    cacheDirectory: string,
    secretName: string,
  ): Promise<void> {
    const caSecretName: string = secretName;
    const generateDirectory: string = PathEx.join(cacheDirectory);

    // Generate TLS certificate and key
    const {certificatePath, keyPath} = await KeyManager.generateTls(generateDirectory, domainName);

    try {
      const certData: string = fs.readFileSync(certificatePath).toString();
      const keyData: string = fs.readFileSync(keyPath).toString();

      const data: Record<string, string> = {
        'tls.crt': Buffer.from(certData).toString('base64'),
        'tls.key': Buffer.from(keyData).toString('base64'),
      };

      // Create k8s secret with the generated certificate and key
      const isSecretCreated: boolean = await k8Factory
        .default()
        .secrets()
        .createOrReplace(namespace, caSecretName, SecretType.OPAQUE, data);

      if (!isSecretCreated) {
        throw new SoloError('failed to create secret for explorer TLS certificates');
      }
    } catch (error: Error | any) {
      const errorMessage: string =
        'failed to create secret for explorer TLS certificates, please check if the secret already exists';
      throw new SoloError(errorMessage, error);
    }
  }

  /**
   * Generates a self-signed TLS certificate and key
   * @param directory Directory to store the certificate and key
   * @param name Common name for the certificate
   * @param expireDays Number of days until the certificate expires
   * @returns Promise with paths to the certificate and key files
   */
  public static async generateTls(
    directory: string,
    name: string = 'localhost',
    expireDays: number = 365,
  ): Promise<{certificatePath: string; keyPath: string}> {
    // Define attributes for the certificate
    const attributes: {name: string; value: string}[] = [{name: 'commonName', value: name}];
    const certificatePath: string = PathEx.join(directory, `${name}.crt`);
    const keyPath: string = PathEx.join(directory, `${name}.key`);

    // Generate the certificate and key
    return new Promise((resolve, reject) => {
      selfsigned.generate(attributes, {days: expireDays}, (error, pems) => {
        if (error) {
          reject(new SoloError(`Error generating TLS keys: ${error.message}`));
          return;
        }
        fs.writeFileSync(certificatePath, pems.cert);
        fs.writeFileSync(keyPath, pems.private);
        resolve({
          certificatePath,
          keyPath,
        });
      });
    });
  }
}
