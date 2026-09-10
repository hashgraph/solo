// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from './errors/solo-errors.js';
import * as x509 from '@peculiar/x509';
import fs from 'node:fs';
import * as constants from './constants.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {Templates} from './templates.js';
import {Helpers} from './helpers.js';
import chalk from 'chalk';
import {type NodeAlias, type NodeAliases} from '../types/aliases.js';
import {type NodeKeyObject, type PrivateKeyAndCertificateObject, type SoloListrTask} from '../types/index.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {PathEx} from '../business/utils/path-ex.js';
import {FilePermissions} from '../business/utils/file-permissions.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {SecretType} from '../integration/kube/resources/secret/secret-type.js';
import * as selfsigned from 'selfsigned';
import {webcrypto} from 'node:crypto';
type NodeCryptoKey = webcrypto.CryptoKey;

// eslint-disable-next-line n/no-unsupported-features/node-builtins
x509.cryptoProvider.set(crypto);

@injectable()
export class KeyManager {
  private static SigningKeyAlgo: {
    name: string;
    hash: string;
    publicExponent: Uint8Array<ArrayBuffer>;
    modulusLength: number;
  } = {
    name: 'RSASSA-PKCS1-v1_5',
    hash: 'SHA-384',
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 3072,
  };

  static SigningKeyUsage: KeyUsage[] = ['sign', 'verify'];

  static TLSKeyAlgo: {name: string; hash: string; publicExponent: Uint8Array<ArrayBuffer>; modulusLength: number} = {
    name: 'RSASSA-PKCS1-v1_5',
    hash: 'SHA-384',
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 4096,
  };

  static TLSKeyUsage: KeyUsage[] = ['sign', 'verify'];
  static TLSCertKeyUsages: number =
    x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment | x509.KeyUsageFlags.dataEncipherment;

  static TLSCertKeyExtendedUsages: any[] = [x509.ExtendedKeyUsage.serverAuth, x509.ExtendedKeyUsage.clientAuth];

  static ECKeyAlgo: {name: string; namedCurve: string; hash: string} = {
    name: 'ECDSA',
    namedCurve: 'P-384',
    hash: 'SHA-384',
  };

  constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  /** Convert NodeCryptoKey into PEM string */
  async convertPrivateKeyToPem(privateKey: NodeCryptoKey): Promise<any> {
    const ab: ArrayBuffer = await webcrypto.subtle.exportKey('pkcs8', privateKey);
    return x509.PemConverter.encode(ab, 'PRIVATE KEY');
  }

  /**
   * Convert PEM private key into NodeCryptoKey
   * @param pemStr - PEM string
   * @param algo - key algorithm
   * @param [keyUsages]
   */
  async convertPemToPrivateKey(pemString: string, algo: any, keyUsages: KeyUsage[] = ['sign']): Promise<CryptoKey> {
    if (!algo) {
      throw new SoloErrors.validation.missingArgument('algo is required');
    }

    const items: any = x509.PemConverter.decode(pemString);

    // Since pem file may include multiple PEM data, the decoder returns an array
    // However for private key there should be a single item.
    // So, we just being careful here to pick the last item (similar to how last PEM data represents the actual cert in
    // a certificate bundle)
    const lastItem: any = items.at(-1);

    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    return await crypto.subtle.importKey('pkcs8', lastItem, algo, false, keyUsages);
  }

  /**
   * Return file names for node key
   * @param nodeAlias
   * @param keysDirectory - directory where keys and certs are stored
   */
  prepareNodeKeyFilePaths(nodeAlias: NodeAlias, keysDirectory: string): PrivateKeyAndCertificateObject {
    if (!nodeAlias) {
      throw new SoloErrors.validation.missingArgument('nodeAlias is required');
    }
    if (!keysDirectory) {
      throw new SoloErrors.validation.missingArgument('keysDirectory is required');
    }

    const keyFile: string = PathEx.join(keysDirectory, Templates.renderGossipPemPrivateKeyFile(nodeAlias));
    const certFile: string = PathEx.join(keysDirectory, Templates.renderGossipPemPublicKeyFile(nodeAlias));

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
  prepareTlsKeyFilePaths(nodeAlias: NodeAlias, keysDirectory: string): PrivateKeyAndCertificateObject {
    if (!nodeAlias) {
      throw new SoloErrors.validation.missingArgument('nodeAlias is required');
    }
    if (!keysDirectory) {
      throw new SoloErrors.validation.missingArgument('keysDirectory is required');
    }

    const keyFile: string = PathEx.join(keysDirectory, `hedera-${nodeAlias}.key`);
    const certFile: string = PathEx.join(keysDirectory, `hedera-${nodeAlias}.crt`);

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
    keyName: string = '',
  ): Promise<PrivateKeyAndCertificateObject> {
    if (!nodeAlias) {
      throw new SoloErrors.validation.missingArgument('nodeAlias is required');
    }

    if (!nodeKey || !nodeKey.privateKey) {
      throw new SoloErrors.validation.missingArgument('nodeKey.ed25519PrivateKey is required');
    }

    if (!nodeKey || !nodeKey.certificateChain) {
      throw new SoloErrors.validation.missingArgument('nodeKey.certificateChain is required');
    }

    if (!keysDirectory) {
      throw new SoloErrors.validation.missingArgument('keysDirectory is required');
    }

    if (!nodeKeyFiles || !nodeKeyFiles.privateKeyFile) {
      throw new SoloErrors.validation.missingArgument('nodeKeyFiles.privateKeyFile is required');
    }

    if (!nodeKeyFiles || !nodeKeyFiles.certificateFile) {
      throw new SoloErrors.validation.missingArgument('nodeKeyFiles.certificateFile is required');
    }

    const keyPem: any = await this.convertPrivateKeyToPem(nodeKey.privateKey);
    const certPems: string[] = [];
    for (const cert of nodeKey.certificateChain) {
      certPems.push(cert.toString('pem'));
    }

    return new Promise((resolve, reject) => {
      try {
        this.logger.debug(`Storing ${keyName} key for node: ${nodeAlias}`, {nodeKeyFiles});

        fs.writeFileSync(nodeKeyFiles.privateKeyFile, keyPem, {mode: 0o600});
        FilePermissions.restrictToOwner(nodeKeyFiles.privateKeyFile, false);

        // remove if the certificate file exists already as otherwise we'll keep appending to the last
        if (fs.existsSync(nodeKeyFiles.certificateFile)) {
          fs.rmSync(nodeKeyFiles.certificateFile);
        }

        for (const certPem of certPems) {
          fs.writeFileSync(nodeKeyFiles.certificateFile, certPem + '\n', {flag: 'a'});
        }

        this.logger.debug(`Stored ${keyName} key for node: ${nodeAlias}`, {
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
    keyName: string = '',
  ): Promise<NodeKeyObject> {
    if (!nodeAlias) {
      throw new SoloErrors.validation.missingArgument('nodeAlias is required');
    }

    if (!keysDirectory) {
      throw new SoloErrors.validation.missingArgument('keysDirectory is required');
    }

    if (!algo) {
      throw new SoloErrors.validation.missingArgument('algo is required');
    }

    if (!nodeKeyFiles || !nodeKeyFiles.privateKeyFile) {
      throw new SoloErrors.validation.missingArgument('nodeKeyFiles.privateKeyFile is required');
    }

    if (!nodeKeyFiles || !nodeKeyFiles.certificateFile) {
      throw new SoloErrors.validation.missingArgument('nodeKeyFiles.certificateFile is required');
    }

    this.logger.debug(`Loading ${keyName}-keys for node: ${nodeAlias}`, {nodeKeyFiles});

    let key: CryptoKey;
    try {
      const keyBytes: Buffer = fs.readFileSync(nodeKeyFiles.privateKeyFile);
      const keyPem: string = keyBytes.toString();
      key = await this.convertPemToPrivateKey(keyPem, algo);
    } catch (error) {
      throw new SoloErrors.component.nodeKeyLoadFailed(keyName, nodeAlias, nodeKeyFiles.privateKeyFile, error as Error);
    }

    let certs: x509.X509Certificate[];
    let certChain: any;
    try {
      const certBytes: Buffer = fs.readFileSync(nodeKeyFiles.certificateFile);
      const certPems: any = x509.PemConverter.decode(certBytes.toString());
      if (certPems.length === 0) {
        throw new Error('no PEM certificate blocks found in file');
      }

      certs = [];
      for (const certPem of certPems) {
        const cert: x509.X509Certificate = new x509.X509Certificate(certPem);
        certs.push(cert);
      }

      certChain = await new x509.X509ChainBuilder({certificates: certs.slice(1)}).build(certs[0]);
    } catch (error) {
      throw new SoloErrors.component.nodeKeyLoadFailed(
        keyName,
        nodeAlias,
        nodeKeyFiles.certificateFile,
        error as Error,
      );
    }

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
      const keyPrefix: string = constants.SIGNING_KEY_PREFIX;
      const currentDate: Date = new Date();
      const friendlyName: string = Templates.renderNodeFriendlyName(keyPrefix, nodeAlias);

      this.logger.debug(`generating ${keyPrefix}-key for node: ${nodeAlias}`, {friendlyName});

      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      const keypair: CryptoKeyPair = await crypto.subtle.generateKey(
        KeyManager.SigningKeyAlgo,
        true,
        KeyManager.SigningKeyUsage,
      );

      const cert: any = await x509.X509CertificateGenerator.createSelfSigned({
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

      const certChain: any = await new x509.X509ChainBuilder().build(cert);

      this.logger.debug(`generated ${keyPrefix}-key for node: ${nodeAlias}`, {cert: cert.toString('pem')});

      return {
        privateKey: keypair.privateKey,
        certificate: cert,
        certificateChain: certChain,
      };
    } catch (error: Error | any) {
      throw new SoloErrors.component.signingKeyGenerationFailed(error);
    }
  }

  /**
   * Store signing key and certificate
   * @param nodeAlias
   * @param nodeKey - an object containing privateKeyPem, certificatePem data
   * @param keysDirectory - directory where keys and certs are stored
   * @returns returns a Promise that saves the keys and certs as PEM files
   */
  storeSigningKey(
    nodeAlias: NodeAlias,
    nodeKey: NodeKeyObject,
    keysDirectory: string,
  ): Promise<PrivateKeyAndCertificateObject> {
    const nodeKeyFiles: PrivateKeyAndCertificateObject = this.prepareNodeKeyFilePaths(nodeAlias, keysDirectory);
    return this.storeNodeKey(nodeAlias, nodeKey, keysDirectory, nodeKeyFiles, 'signing');
  }

  /**
   * Load signing key and certificate
   * @param nodeAlias
   * @param keysDirectory - directory path where pem files are stored
   */
  loadSigningKey(nodeAlias: NodeAlias, keysDirectory: string): Promise<NodeKeyObject> {
    const nodeKeyFiles: PrivateKeyAndCertificateObject = this.prepareNodeKeyFilePaths(nodeAlias, keysDirectory);
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
      throw new SoloErrors.validation.missingArgument('nodeAlias is required');
    }
    if (!distinguishedName) {
      throw new SoloErrors.validation.missingArgument('distinguishedName is required');
    }

    try {
      const currentDate: Date = new Date();

      this.logger.debug(`generating gRPC TLS for node: ${nodeAlias}`, {distinguishedName});

      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      const keypair: CryptoKeyPair = await crypto.subtle.generateKey(
        KeyManager.TLSKeyAlgo,
        true,
        KeyManager.TLSKeyUsage,
      );

      const cert: any = await x509.X509CertificateGenerator.createSelfSigned({
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

      const certChain: any = await new x509.X509ChainBuilder().build(cert);

      this.logger.debug(`generated gRPC TLS for node: ${nodeAlias}`, {cert: cert.toString('pem')});

      return {
        privateKey: keypair.privateKey,
        certificate: cert,
        certificateChain: certChain,
      };
    } catch (error: Error | any) {
      throw new SoloErrors.component.grpcTlsKeyGenerationFailed(error);
    }
  }

  /**
   * Store TLS key and certificate
   * @param nodeAlias
   * @param nodeKey
   * @param keysDirectory - directory where keys and certs are stored
   * @returns a Promise that saves the keys and certs as PEM files
   */
  storeTLSKey(
    nodeAlias: NodeAlias,
    nodeKey: NodeKeyObject,
    keysDirectory: string,
  ): Promise<PrivateKeyAndCertificateObject> {
    const nodeKeyFiles: PrivateKeyAndCertificateObject = this.prepareTlsKeyFilePaths(nodeAlias, keysDirectory);
    return this.storeNodeKey(nodeAlias, nodeKey, keysDirectory, nodeKeyFiles, 'gRPC TLS');
  }

  /**
   * Load TLS key and certificate
   * @param nodeAlias
   * @param keysDirectory - directory path where pem files are stored
   */
  loadTLSKey(nodeAlias: NodeAlias, keysDirectory: string): Promise<NodeKeyObject> {
    const nodeKeyFiles: PrivateKeyAndCertificateObject = this.prepareTlsKeyFilePaths(nodeAlias, keysDirectory);
    return this.loadNodeKey(nodeAlias, keysDirectory, KeyManager.TLSKeyAlgo, nodeKeyFiles, 'gRPC TLS');
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
    _allNodeAliases: NodeAliases | null = null,
  ) {
    if (!Array.isArray(nodeAliases) || !nodeAliases.every(nodeAlias => typeof nodeAlias === 'string')) {
      throw new SoloErrors.validation.illegalArgument(
        'nodeAliases must be an array of strings, nodeAliases = ' + JSON.stringify(nodeAliases),
      );
    }
    const subTasks: SoloListrTask<any>[] = [
      {
        title: 'Backup old files',
        task: (): string => Helpers.backupOldPemKeys(nodeAliases, keysDirectory, currentDate),
      },
    ];

    for (const nodeAlias of nodeAliases) {
      subTasks.push({
        title: `Gossip key for node: ${chalk.yellow(nodeAlias)}`,
        task: async () => {
          const signingKey = await this.generateSigningKey(nodeAlias);
          const signingKeyFiles = await this.storeSigningKey(nodeAlias, signingKey, keysDirectory);
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
  taskGenerateTLSKeys(
    nodeAliases: NodeAliases,
    keysDirectory: string,
    currentDate: Date = new Date(),
  ): SoloListrTask<any>[] {
    // check if nodeAliases is an array of strings
    if (!Array.isArray(nodeAliases) || !nodeAliases.every((nodeAlias): boolean => typeof nodeAlias === 'string')) {
      throw new SoloErrors.validation.nodeAliasesMustBeArray();
    }
    const nodeKeyFiles = new Map();
    const subTasks: SoloListrTask<any>[] = [
      {
        title: 'Backup old files',
        task: (): string => Helpers.backupOldTlsKeys(nodeAliases, keysDirectory, currentDate),
      },
    ];

    for (const nodeAlias of nodeAliases) {
      subTasks.push({
        title: `TLS key for node: ${chalk.yellow(nodeAlias)}`,
        task: async () => {
          const tlsKey = await this.generateGrpcTlsKey(nodeAlias);
          const tlsKeyFiles = await this.storeTLSKey(nodeAlias, tlsKey, keysDirectory);
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
  getDerFromPemCertificate(pemCertFullPath: string): Uint8Array<ArrayBuffer> {
    const certPem: string = fs.readFileSync(pemCertFullPath).toString();
    return this.getDerFromPem(certPem, pemCertFullPath);
  }

  /**
   * Convert a PEM certificate (Base64 ASCII) into its DER (raw binary) bytes. Use this when the PEM is
   * already in memory (e.g. read back from a Kubernetes secret) rather than on disk.
   * @param certPem - the PEM certificate contents
   * @param [source] - optional identifier of where the PEM came from, used in error messages
   */
  getDerFromPem(certPem: string, source: string = 'in-memory certificate'): Uint8Array<ArrayBuffer> {
    const decodedDers: any = x509.PemConverter.decode(certPem);
    if (!decodedDers || decodedDers.length === 0) {
      throw new SoloErrors.component.platformKeyFileMissing(source);
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
    const {certificatePath, keyPath}: {certificatePath: string; keyPath: string} = await KeyManager.generateTls(
      generateDirectory,
      domainName,
    );

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
        throw new SoloErrors.component.explorerTlsSecretCreationFailed();
      }
    } catch (error: Error | any) {
      throw new SoloErrors.component.explorerTlsSecretCreationFailed(error);
    }

    // The self-signed cert/key now live in the cluster secret, so remove the on-disk copies to avoid
    // leaving the private key behind in the cache; they are regenerated on the next deploy when needed.
    for (const generatedFilePath of [keyPath, certificatePath]) {
      try {
        fs.rmSync(generatedFilePath, {force: true});
      } catch {
        // best-effort: the secret is already created, so a failed cache cleanup must not fail the deploy
      }
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
    try {
      const notBeforeDate: Date = new Date();
      const notAfterDate: Date = new Date(notBeforeDate);
      notAfterDate.setDate(notAfterDate.getDate() + expireDays);

      const pems: {private: string; public: string; cert: string; fingerprint: string} = await selfsigned.generate(
        attributes,
        {
          keySize: 2048,
          algorithm: 'sha256',
          notBeforeDate,
          notAfterDate,
        },
      );
      fs.writeFileSync(certificatePath, pems.cert);
      fs.writeFileSync(keyPath, pems.private, {mode: 0o600});
      FilePermissions.restrictToOwner(keyPath, false);
      return {
        certificatePath,
        keyPath,
      };
    } catch (error: Error | unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      throw new SoloErrors.component.tlsKeyGenerationFailed(errorMessage);
    }
  }
}
