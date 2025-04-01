// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias, type NodeAliases} from '../../types/aliases.js';
import {PrivateKey} from '@hashgraph/sdk';
import {type NodeDeleteConfigClass} from './config-interfaces/node-delete-config-class.js';
import {type NodeUpdateConfigClass} from './config-interfaces/node-update-config-class.js';
import {type NodeUpgradeConfigClass} from './config-interfaces/node-upgrade-config-class.js';

export class NodeHelper {
  /**
   * Returns an object that can be written to a file without data loss.
   * Contains fields needed for deleting a node through separate commands
   * @param ctx - accumulator object
   * @returns file writable object
   */
  public static deleteSaveContextParser(context_: {config: NodeDeleteConfigClass; upgradeZipHash: string}) {
    const exportedContext = {} as {
      adminKey: string;
      existingNodeAliases: NodeAliases;
      upgradeZipHash: string;
      nodeAlias: NodeAlias;
    };

    const config = context_.config;
    exportedContext.adminKey = config.adminKey.toString();
    exportedContext.existingNodeAliases = config.existingNodeAliases;
    exportedContext.upgradeZipHash = context_.upgradeZipHash;
    exportedContext.nodeAlias = config.nodeAlias;
    return exportedContext;
  }

  /**
   * Initializes objects in the context from a provided string
   * Contains fields needed for deleting a node through separate commands
   * @param ctx - accumulator object
   * @param ctxData - data in string format
   * @returns file writable object
   */
  public static deleteLoadContextParser(
    context_: {config: NodeDeleteConfigClass; upgradeZipHash: string},
    contextData: any,
  ) {
    const config = context_.config;
    config.adminKey = PrivateKey.fromStringED25519(contextData.adminKey);
    config.existingNodeAliases = contextData.existingNodeAliases;
    config.allNodeAliases = contextData.existingNodeAliases;
    context_.upgradeZipHash = contextData.upgradeZipHash;
    config.podRefs = {};
  }

  /**
   * Returns an object that can be written to a file without data loss.
   * Contains fields needed for updating a node through separate commands
   * @param ctx - accumulator object
   * @returns file writable object
   */
  public static updateSaveContextParser(context_: {config: NodeUpdateConfigClass; upgradeZipHash: string}) {
    const exportedContext: any = {};

    const config = /** @type {NodeUpdateConfigClass} **/ context_.config;
    exportedContext.adminKey = config.adminKey.toString();
    exportedContext.newAdminKey = config.newAdminKey.toString();
    exportedContext.freezeAdminPrivateKey = config.freezeAdminPrivateKey.toString();
    exportedContext.treasuryKey = config.treasuryKey.toString();
    exportedContext.existingNodeAliases = config.existingNodeAliases;
    exportedContext.upgradeZipHash = context_.upgradeZipHash;
    exportedContext.nodeAlias = config.nodeAlias;
    exportedContext.newAccountNumber = config.newAccountNumber;
    exportedContext.tlsPublicKey = config.tlsPublicKey;
    exportedContext.tlsPrivateKey = config.tlsPrivateKey;
    exportedContext.gossipPublicKey = config.gossipPublicKey;
    exportedContext.gossipPrivateKey = config.gossipPrivateKey;
    exportedContext.allNodeAliases = config.allNodeAliases;

    return exportedContext;
  }

  /**
   * Returns an object that can be written to a file without data loss.
   * Contains fields needed for upgrading a node through separate commands
   * @param ctx - accumulator object
   * @returns file writable object
   */
  public static upgradeSaveContextParser(context_: {config: NodeUpgradeConfigClass; upgradeZipHash: string}) {
    const exportedContext: any = {};

    const config = /** @type {NodeUpgradeConfigClass} **/ context_.config;
    exportedContext.adminKey = config.adminKey.toString();
    exportedContext.freezeAdminPrivateKey = config.freezeAdminPrivateKey.toString();
    exportedContext.existingNodeAliases = config.existingNodeAliases;
    exportedContext.upgradeZipHash = context_.upgradeZipHash;
    exportedContext.allNodeAliases = config.allNodeAliases;

    return exportedContext;
  }

  /**
   * Initializes objects in the context from a provided string
   * Contains fields needed for updating a node through separate commands
   * @param ctx - accumulator object
   * @param ctxData - data in string format
   * @returns file writable object
   */
  public static upgradeLoadContextParser(
    context_: {config: NodeUpgradeConfigClass; upgradeZipHash: string},
    contextData: any,
  ) {
    const config = context_.config;

    config.freezeAdminPrivateKey = PrivateKey.fromStringED25519(contextData.freezeAdminPrivateKey);
    config.adminKey = PrivateKey.fromStringED25519(contextData.adminKey);
    config.existingNodeAliases = contextData.existingNodeAliases;
    config.allNodeAliases = contextData.allNodeAliases;
    context_.upgradeZipHash = contextData.upgradeZipHash;
    config.podRefs = {};
  }

  /**
   * Initializes objects in the context from a provided string
   * Contains fields needed for updating a node through separate commands
   * @param ctx - accumulator object
   * @param ctxData - data in string format
   * @returns file writable object
   */
  public static updateLoadContextParser(
    context_: {config: NodeUpdateConfigClass; upgradeZipHash: string},
    contextData: any,
  ) {
    const config = context_.config;

    if (contextData.newAdminKey && contextData.newAdminKey.length > 0) {
      config.newAdminKey = PrivateKey.fromStringED25519(contextData.newAdminKey);
    }

    config.freezeAdminPrivateKey = PrivateKey.fromStringED25519(contextData.freezeAdminPrivateKey);
    config.treasuryKey = PrivateKey.fromStringED25519(contextData.treasuryKey);
    config.adminKey = PrivateKey.fromStringED25519(contextData.adminKey);
    config.existingNodeAliases = contextData.existingNodeAliases;
    config.nodeAlias = contextData.nodeAlias;
    config.newAccountNumber = contextData.newAccountNumber;
    config.tlsPublicKey = contextData.tlsPublicKey;
    config.tlsPrivateKey = contextData.tlsPrivateKey;
    config.gossipPublicKey = contextData.gossipPublicKey;
    config.gossipPrivateKey = contextData.gossipPrivateKey;
    config.allNodeAliases = contextData.allNodeAliases;
    context_.upgradeZipHash = contextData.upgradeZipHash;
    config.podRefs = {};
  }
}
