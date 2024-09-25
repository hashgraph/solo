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
'use strict'
import * as x509 from '@peculiar/x509'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { FullstackTestingError, IllegalArgumentError, MissingArgumentError } from './errors.mjs'
import { constants } from './index.mjs'
import { Logger } from './logging.mjs'
import { Templates } from './templates.mjs'
import * as helpers from './helpers.mjs'
import chalk from 'chalk'

x509.cryptoProvider.set(crypto)

/**
 * @typedef {Object} NodeKeyObject
 * @property {CryptoKey} privateKey
 * @property {x509.X509Certificate} certificate
 * @property {x509.X509Certificates} certificateChain
 */

/**
 * @typedef {Object} PrivateKeyAndCertificateObject
 * @property {string} privateKeyFile
 * @property {string} certificateFile
 */

export class KeyManager {
  static SigningKeyAlgo = {
    name: 'RSASSA-PKCS1-v1_5',
    hash: 'SHA-384',
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 3072
  }

  static SigningKeyUsage = ['sign', 'verify']

  static TLSKeyAlgo = {
    name: 'RSASSA-PKCS1-v1_5',
    hash: 'SHA-384',
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 4096
  }

  static TLSKeyUsage = ['sign', 'verify']
  static TLSCertKeyUsages =
    x509.KeyUsageFlags.digitalSignature |
    x509.KeyUsageFlags.keyEncipherment |
    x509.KeyUsageFlags.dataEncipherment

  static TLSCertKeyExtendedUsages = [
    x509.ExtendedKeyUsage.serverAuth,
    x509.ExtendedKeyUsage.clientAuth
  ]

  static ECKeyAlgo = {
    name: 'ECDSA',
    namedCurve: 'P-384',
    hash: 'SHA-384'
  }

  /**
   * @param {Logger} logger
   */
  constructor (logger) {
    if (!logger || !(logger instanceof Logger)) throw new MissingArgumentError('An instance of core/Logger is required')
    this.logger = logger
  }

  /**
   * Convert CryptoKey into PEM string
   * @param {CryptoKey} privateKey
   * @returns {Promise<string>}
   */
  async convertPrivateKeyToPem (privateKey) {
    const ab = await crypto.subtle.exportKey('pkcs8', privateKey)
    return x509.PemConverter.encode(ab, 'PRIVATE KEY')
  }

  /**
   * Convert PEM private key into CryptoKey
   * @param {string} pemStr - PEM string
   * @param {*} algo - key algorithm
   * @param {string[]} [keyUsages]
   * @returns {Promise<CryptoKey>}
   */
  async convertPemToPrivateKey (pemStr, algo, keyUsages = ['sign']) {
    if (!algo) throw new MissingArgumentError('algo is required')

    const items = x509.PemConverter.decode(pemStr)

    // Since pem file may include multiple PEM data, the decoder returns an array
    // However for private key there should be a single item.
    // So, we just being careful here to pick the last item (similar to how last PEM data represents the actual cert in
    // a certificate bundle)
    const lastItem = items[items.length - 1]

    return await crypto.subtle.importKey('pkcs8', lastItem, algo, false, keyUsages)
  }

  /**
   * Return file names for node key
   * @param {NodeAlias} nodeAlias
   * @param {string} keysDir - directory where keys and certs are stored
   * @param {string} [keyPrefix] - key prefix such as constants.SIGNING_KEY_PREFIX
   * @returns {PrivateKeyAndCertificateObject}
   */
  prepareNodeKeyFilePaths (nodeAlias, keysDir, keyPrefix = constants.SIGNING_KEY_PREFIX) {
    if (!nodeAlias) throw new MissingArgumentError('nodeAlias is required')
    if (!keysDir) throw new MissingArgumentError('keysDir is required')
    if (!keyPrefix) throw new MissingArgumentError('keyPrefix is required')

    const keyFile = path.join(keysDir, Templates.renderGossipPemPrivateKeyFile(keyPrefix, nodeAlias))
    const certFile = path.join(keysDir, Templates.renderGossipPemPublicKeyFile(keyPrefix, nodeAlias))

    return {
      privateKeyFile: keyFile,
      certificateFile: certFile
    }
  }

  /**
   * Return file names for TLS key
   * @param {NodeAlias} nodeAlias
   * @param {string} keysDir - directory where keys and certs are stored
   * @returns {PrivateKeyAndCertificateObject}
   */
  prepareTLSKeyFilePaths (nodeAlias, keysDir) {
    if (!nodeAlias) throw new MissingArgumentError('nodeAlias is required')
    if (!keysDir) throw new MissingArgumentError('keysDir is required')

    const keyFile = path.join(keysDir, `hedera-${nodeAlias}.key`)
    const certFile = path.join(keysDir, `hedera-${nodeAlias}.crt`)

    return {
      privateKeyFile: keyFile,
      certificateFile: certFile
    }
  }

  /**
   * Store node keys and certs as PEM files
   * @param {NodeAlias} nodeAlias
   * @param {NodeKeyObject} nodeKey
   * @param {string} keysDir - directory where keys and certs are stored
   * @param {PrivateKeyAndCertificateObject} nodeKeyFiles
   * @param {string} [keyName] - optional key type name for logging
   * @returns {Promise<PrivateKeyAndCertificateObject>} a Promise that saves the keys and certs as PEM files
   */
  async storeNodeKey (nodeAlias, nodeKey, keysDir, nodeKeyFiles, keyName = '') {
    if (!nodeAlias) {
      throw new MissingArgumentError('nodeAlias is required')
    }

    if (!nodeKey || !nodeKey.privateKey) {
      throw new MissingArgumentError('nodeKey.privateKey is required')
    }

    if (!nodeKey || !nodeKey.certificateChain) {
      throw new MissingArgumentError('nodeKey.certificateChain is required')
    }

    if (!keysDir) {
      throw new MissingArgumentError('keysDir is required')
    }

    if (!nodeKeyFiles || !nodeKeyFiles.privateKeyFile) {
      throw new MissingArgumentError('nodeKeyFiles.privateKeyFile is required')
    }

    if (!nodeKeyFiles || !nodeKeyFiles.certificateFile) {
      throw new MissingArgumentError('nodeKeyFiles.certificateFile is required')
    }

    const keyPem = await this.convertPrivateKeyToPem(nodeKey.privateKey)
    const certPems = []
    nodeKey.certificateChain.forEach(cert => {
      certPems.push(cert.toString('pem'))
    })

    const self = this
    return new Promise((resolve, reject) => {
      try {
        this.logger.debug(`Storing ${keyName} key for node: ${nodeAlias}`, { nodeKeyFiles })

        fs.writeFileSync(nodeKeyFiles.privateKeyFile, keyPem)

        // remove if the certificate file exists already as otherwise we'll keep appending to the last
        if (fs.existsSync(nodeKeyFiles.certificateFile)) {
          fs.rmSync(nodeKeyFiles.certificateFile)
        }

        certPems.forEach(certPem => {
          fs.writeFileSync(nodeKeyFiles.certificateFile, certPem + '\n', { flag: 'a' })
        })

        self.logger.debug(`Stored ${keyName} key for node: ${nodeAlias}`, {
          nodeKeyFiles
        })

        resolve(nodeKeyFiles)
      } catch (e) {
        reject(e)
      }
    })
  }

  /**
   * Load node keys and certs from PEM files
   * @param {NodeAlias} nodeAlias
   * @param {string} keysDir - directory where keys and certs are stored
   * @param {*} algo - algorithm used for key
   * @param {{privateKeyFile: string, certificateFile: string}} nodeKeyFiles an object stores privateKeyFile and certificateFile
   * @param {string} [keyName] - optional key type name for logging
   * @returns {Promise<NodeKeyObject>}
   */
  async loadNodeKey (nodeAlias, keysDir, algo, nodeKeyFiles, keyName = '') {
    if (!nodeAlias) {
      throw new MissingArgumentError('nodeAlias is required')
    }

    if (!keysDir) {
      throw new MissingArgumentError('keysDir is required')
    }

    if (!algo) {
      throw new MissingArgumentError('algo is required')
    }

    if (!nodeKeyFiles || !nodeKeyFiles.privateKeyFile) {
      throw new MissingArgumentError('nodeKeyFiles.privateKeyFile is required')
    }

    if (!nodeKeyFiles || !nodeKeyFiles.certificateFile) {
      throw new MissingArgumentError('nodeKeyFiles.certificateFile is required')
    }

    this.logger.debug(`Loading ${keyName}-keys for node: ${nodeAlias}`, { nodeKeyFiles })

    const keyBytes = await fs.readFileSync(nodeKeyFiles.privateKeyFile)
    const keyPem = keyBytes.toString()
    const key = await this.convertPemToPrivateKey(keyPem, algo)

    const certBytes = await fs.readFileSync(nodeKeyFiles.certificateFile)
    const certPems = x509.PemConverter.decode(certBytes.toString())

    /** @type {x509.X509Certificate[]} */
    const certs = []
    certPems.forEach(certPem => {
      const cert = new x509.X509Certificate(certPem)
      certs.push(cert)
    })

    const certChain = await new x509.X509ChainBuilder({ certificates: certs.slice(1) }).build(certs[0])

    this.logger.debug(`Loaded ${keyName}-key for node: ${nodeAlias}`, {
      nodeKeyFiles,
      cert: certs[0].toString('pem')
    })
    return {
      privateKey: key,
      certificate: certs[0],
      certificateChain: certChain
    }
  }

  /**
   * Generate signing key and certificate
   * @param {NodeAlias} nodeAlias
   * @returns {Promise<{NodeKeyObject>}
   */
  async generateSigningKey (nodeAlias) {
    try {
      const keyPrefix = constants.SIGNING_KEY_PREFIX
      const curDate = new Date()
      const friendlyName = Templates.renderNodeFriendlyName(keyPrefix, nodeAlias)

      this.logger.debug(`generating ${keyPrefix}-key for node: ${nodeAlias}`, { friendlyName })

      const keypair = await crypto.subtle.generateKey(
        KeyManager.SigningKeyAlgo,
        true,
        KeyManager.SigningKeyUsage)

      const cert = await x509.X509CertificateGenerator.createSelfSigned({
        serialNumber: '01',
        name: `CN=${friendlyName}`,
        notBefore: curDate,
        notAfter: new Date().setFullYear(curDate.getFullYear() + constants.CERTIFICATE_VALIDITY_YEARS),
        keys: keypair,
        extensions: [
          new x509.BasicConstraintsExtension(true, 1, true),
          new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth, x509.ExtendedKeyUsage.clientAuth], true),
          new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
          await x509.SubjectKeyIdentifierExtension.create(keypair.publicKey)
        ]
      })

      const certChain = await new x509.X509ChainBuilder().build(cert)

      this.logger.debug(`generated ${keyPrefix}-key for node: ${nodeAlias}`, { cert: cert.toString('pem') })

      return {
        privateKey: keypair.privateKey,
        certificate: cert,
        certificateChain: certChain
      }
    } catch (e) {
      throw new FullstackTestingError(`failed to generate signing key: ${e.message}`, e)
    }
  }

  /**
   * Store signing key and certificate
   * @param {NodeAlias} nodeAlias
   * @param {NodeKeyObject} nodeKey - an object containing privateKeyPem, certificatePem data
   * @param {string} keysDir - directory where keys and certs are stored
   * @returns {Promise<*>} returns a Promise that saves the keys and certs as PEM files
   */
  async storeSigningKey (nodeAlias, nodeKey, keysDir) {
    const nodeKeyFiles = this.prepareNodeKeyFilePaths(nodeAlias, keysDir, constants.SIGNING_KEY_PREFIX)
    return this.storeNodeKey(nodeAlias, nodeKey, keysDir, nodeKeyFiles, 'signing')
  }

  /**
   * Load signing key and certificate
   * @param {NodeAlias} nodeAlias
   * @param {string} keysDir - directory path where pem files are stored
   * @returns {Promise<NodeKeyObject>}
   */
  async loadSigningKey (nodeAlias, keysDir) {
    const nodeKeyFiles = this.prepareNodeKeyFilePaths(nodeAlias, keysDir, constants.SIGNING_KEY_PREFIX)
    return this.loadNodeKey(nodeAlias, keysDir, KeyManager.SigningKeyAlgo, nodeKeyFiles, 'signing')
  }

  /**
   * Generate EC key and cert
   *
   * @param {NodeAlias} nodeAlias
   * @param {string} keyPrefix - key prefix such as constants.SIGNING_KEY_PREFIX
   * @param {NodeKeyObject} signingKey
   * @returns {Promise<NodeKeyObject>} a dictionary object stores privateKey, certificate, certificateChain
   */
  async ecKey (nodeAlias, keyPrefix, signingKey) {
    if (!nodeAlias) throw new MissingArgumentError('nodeAlias is required')
    if (!keyPrefix) throw new MissingArgumentError('keyPrefix is required')
    if (!signingKey) throw new MissingArgumentError('no signing key found')

    try {
      const curDate = new Date()
      const notAfter = new Date().setFullYear(curDate.getFullYear() + constants.CERTIFICATE_VALIDITY_YEARS)
      const friendlyName = Templates.renderNodeFriendlyName(keyPrefix, nodeAlias)

      this.logger.debug(`generating ${keyPrefix}-key for node: ${nodeAlias}`, { friendlyName })

      const keypair = await crypto.subtle.generateKey(KeyManager.ECKeyAlgo, true, ['sign', 'verify'])

      const cert = await x509.X509CertificateGenerator.create({
        publicKey: keypair.publicKey,
        signingKey: signingKey.privateKey,
        subject: `CN=${friendlyName}`,
        issuer: signingKey.certificate.subject,
        serialNumber: '01',
        notBefore: curDate,
        notAfter,
        extensions: [
          new x509.KeyUsagesExtension(
            x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment)
        ]
      })

      if (!await cert.verify({
        date: new Date(notAfter),
        publicKey: signingKey.certificate.publicKey,
        signatureOnly: true
      })) {
        throw new FullstackTestingError(`failed to verify generated certificate for '${friendlyName}'`)
      }

      const certChain = await new x509.X509ChainBuilder({ certificates: [signingKey.certificate] }).build(cert)

      this.logger.debug(`generated ${keyPrefix}-key for node: ${nodeAlias}`, { cert: cert.toString('pem') })
      return {
        privateKey: keypair.privateKey,
        certificate: cert,
        certificateChain: certChain
      }
    } catch (e) {
      throw new FullstackTestingError(`failed to generate ${keyPrefix}-key: ${e.message}`, e)
    }
  }

  /**
   * Generate gRPC TLS key
   *
   * It generates TLS keys in PEM format such as below:
   *  hedera-<nodeAlias>.key
   *  hedera-<nodeAlias>.crt
   *
   * @param {NodeAlias} nodeAlias
   * @param {x509.Name} distinguishedName distinguished name as: new x509.Name(`CN=${nodeAlias},ST=${state},L=${locality},O=${org},OU=${orgUnit},C=${country}`)
   * @returns {Promise<NodeKeyObject>}
   */
  async generateGrpcTLSKey (nodeAlias, distinguishedName = new x509.Name(`CN=${nodeAlias}`)) {
    if (!nodeAlias) throw new MissingArgumentError('nodeAlias is required')
    if (!distinguishedName) throw new MissingArgumentError('distinguishedName is required')

    try {
      const curDate = new Date()

      this.logger.debug(`generating gRPC TLS for node: ${nodeAlias}`, { distinguishedName })

      const keypair = await crypto.subtle.generateKey(
        KeyManager.TLSKeyAlgo,
        true,
        KeyManager.TLSKeyUsage)

      const cert = await x509.X509CertificateGenerator.createSelfSigned({
        serialNumber: '01',
        name: distinguishedName,
        notBefore: curDate,
        notAfter: new Date().setFullYear(curDate.getFullYear() + constants.CERTIFICATE_VALIDITY_YEARS),
        keys: keypair,
        extensions:
          [
            new x509.BasicConstraintsExtension(false, 0, true),
            new x509.KeyUsagesExtension(KeyManager.TLSCertKeyUsages, true),
            new x509.ExtendedKeyUsageExtension(KeyManager.TLSCertKeyExtendedUsages, true),
            await x509.SubjectKeyIdentifierExtension.create(keypair.publicKey, false),
            await x509.AuthorityKeyIdentifierExtension.create(keypair.publicKey, false)
          ]
      })

      const certChain = await new x509.X509ChainBuilder().build(cert)

      this.logger.debug(`generated gRPC TLS for node: ${nodeAlias}`, { cert: cert.toString('pem') })

      return {
        privateKey: keypair.privateKey,
        certificate: cert,
        certificateChain: certChain
      }
    } catch (e) {
      throw new FullstackTestingError(`failed to generate gRPC TLS key: ${e.message}`, e)
    }
  }

  /**
   * Store TLS key and certificate
   * @param {NodeAlias} nodeAlias
   * @param {NodeKeyObject} nodeKey
   * @param {string} keysDir - directory where keys and certs are stored
   * @returns {Promise<PrivateKeyAndCertificateObject>} a Promise that saves the keys and certs as PEM files
   */
  async storeTLSKey (nodeAlias, nodeKey, keysDir) {
    const nodeKeyFiles = this.prepareTLSKeyFilePaths(nodeAlias, keysDir)
    return this.storeNodeKey(nodeAlias, nodeKey, keysDir, nodeKeyFiles, 'gRPC TLS')
  }

  /**
   * Load TLS key and certificate
   * @param {NodeAlias} nodeAlias
   * @param {string} keysDir - directory path where pem files are stored
   * @returns {Promise<NodeKeyObject>}
   */
  async loadTLSKey (nodeAlias, keysDir) {
    const nodeKeyFiles = this.prepareTLSKeyFilePaths(nodeAlias, keysDir)
    return this.loadNodeKey(nodeAlias, keysDir, KeyManager.TLSKeyAlgo, nodeKeyFiles, 'gRPC TLS')
  }

  async copyNodeKeysToStaging (nodeKey, destDir) {
    for (const keyFile of [nodeKey.privateKeyFile, nodeKey.certificateFile]) {
      if (!fs.existsSync(keyFile)) {
        throw new FullstackTestingError(`file (${keyFile}) is missing`)
      }

      const fileName = path.basename(keyFile)
      fs.cpSync(keyFile, path.join(destDir, fileName))
    }
  }

  /**
   * @param {string} keysDir
   * @param {string} stagingKeysDir
   * @param {NodeAliases} nodeAliases
   * @returns {Promise<void>}
   */
  async copyGossipKeysToStaging (keysDir, stagingKeysDir, nodeAliases) {
    // copy gossip keys to the staging
    for (const nodeAlias of nodeAliases) {
      const signingKeyFiles = this.prepareNodeKeyFilePaths(nodeAlias, keysDir, constants.SIGNING_KEY_PREFIX)
      await this.copyNodeKeysToStaging(signingKeyFiles, stagingKeysDir)
    }
  }

  /**
   * Return a list of subtasks to generate gossip keys
   *
   * WARNING: These tasks MUST run in sequence.
   *
   * @param keytoolDepManager - an instance of core/KeytoolDepManager
   * @param {NodeAliases} nodeAliases
   * @param keysDir - keys directory
   * @param curDate - current date
   * @param {NodeAliases|null} allNodeAliases - includes the nodeAliases to get new keys as well as existing nodeAliases that will be included in the public.pfx file
   * @return a list of subtasks
   * @private
   */
  taskGenerateGossipKeys (keytoolDepManager, nodeAliases, keysDir, curDate = new Date(), allNodeAliases = null) {
    allNodeAliases = allNodeAliases || nodeAliases
    if (!Array.isArray(nodeAliases) || !nodeAliases.every((nodeAlias) => typeof nodeAlias === 'string')) {
      throw new IllegalArgumentError('nodeAliases must be an array of strings, nodeAliases = ' + JSON.stringify(nodeAliases))
    }
    const self = this
    const subTasks = []

    subTasks.push({
      title: 'Backup old files',
      task: () => helpers.backupOldPemKeys(nodeAliases, keysDir, curDate)
    }
    )

    for (const nodeAlias of nodeAliases) {
      subTasks.push({
        title: `Gossip key for node: ${chalk.yellow(nodeAlias)}`,
        task: async () => {
          const signingKey = await self.generateSigningKey(nodeAlias)
          const signingKeyFiles = await self.storeSigningKey(nodeAlias, signingKey, keysDir)
          this.logger.debug(`generated Gossip signing keys for node ${nodeAlias}`, { keyFiles: signingKeyFiles })
        }
      })
    }
    return subTasks
  }

  /**
   *  Return a list of subtasks to generate gRPC TLS keys
   *
   * WARNING: These tasks should run in sequence
   *
   * @param {NodeAliases} nodeAliases
   * @param keysDir keys directory
   * @param curDate current date
   * @return return a list of subtasks
   * @private
   */
  taskGenerateTLSKeys (nodeAliases, keysDir, curDate = new Date()) {
    // check if nodeAliases is an array of strings
    if (!Array.isArray(nodeAliases) || !nodeAliases.every((nodeAlias) => typeof nodeAlias === 'string')) {
      throw new FullstackTestingError('nodeAliases must be an array of strings')
    }
    const self = this
    const nodeKeyFiles = new Map()
    const subTasks = []

    subTasks.push({
      title: 'Backup old files',
      task: () => helpers.backupOldTlsKeys(nodeAliases, keysDir, curDate)
    }
    )

    for (const nodeAlias of nodeAliases) {
      subTasks.push({
        title: `TLS key for node: ${chalk.yellow(nodeAlias)}`,
        task: async () => {
          const tlsKey = await self.generateGrpcTLSKey(nodeAlias)
          const tlsKeyFiles = await self.storeTLSKey(nodeAlias, tlsKey, keysDir)
          nodeKeyFiles.set(nodeAlias, {
            tlsKeyFiles
          })
        }
      })
    }

    return subTasks
  }
}
