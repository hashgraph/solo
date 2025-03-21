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
  public static deleteSaveContextParser(ctx: {config: NodeDeleteConfigClass; upgradeZipHash: any}) {
    const exportedCtx = {} as {
      adminKey: string;
      existingNodeAliases: NodeAliases;
      upgradeZipHash: string;
      nodeAlias: NodeAlias;
    };

    const config = ctx.config;
    exportedCtx.adminKey = config.adminKey.toString();
    exportedCtx.existingNodeAliases = config.existingNodeAliases;
    exportedCtx.upgradeZipHash = ctx.upgradeZipHash;
    exportedCtx.nodeAlias = config.nodeAlias;
    return exportedCtx;
  }

  /**
   * Initializes objects in the context from a provided string
   * Contains fields needed for deleting a node through separate commands
   * @param ctx - accumulator object
   * @param ctxData - data in string format
   * @returns file writable object
   */
  public static deleteLoadContextParser(ctx: {config: NodeDeleteConfigClass; upgradeZipHash: any}, ctxData: any) {
    const config = ctx.config;
    config.adminKey = PrivateKey.fromStringED25519(ctxData.adminKey);
    config.existingNodeAliases = ctxData.existingNodeAliases;
    config.allNodeAliases = ctxData.existingNodeAliases;
    ctx.upgradeZipHash = ctxData.upgradeZipHash;
    config.podRefs = {};
  }

  /**
   * Returns an object that can be written to a file without data loss.
   * Contains fields needed for updating a node through separate commands
   * @param ctx - accumulator object
   * @returns file writable object
   */
  public static updateSaveContextParser(ctx: {config: NodeUpdateConfigClass; upgradeZipHash: any}) {
    const exportedCtx: any = {};

    const config = /** @type {NodeUpdateConfigClass} **/ ctx.config;
    exportedCtx.adminKey = config.adminKey.toString();
    exportedCtx.newAdminKey = config.newAdminKey.toString();
    exportedCtx.freezeAdminPrivateKey = config.freezeAdminPrivateKey.toString();
    exportedCtx.treasuryKey = config.treasuryKey.toString();
    exportedCtx.existingNodeAliases = config.existingNodeAliases;
    exportedCtx.upgradeZipHash = ctx.upgradeZipHash;
    exportedCtx.nodeAlias = config.nodeAlias;
    exportedCtx.newAccountNumber = config.newAccountNumber;
    exportedCtx.tlsPublicKey = config.tlsPublicKey;
    exportedCtx.tlsPrivateKey = config.tlsPrivateKey;
    exportedCtx.gossipPublicKey = config.gossipPublicKey;
    exportedCtx.gossipPrivateKey = config.gossipPrivateKey;
    exportedCtx.allNodeAliases = config.allNodeAliases;

    return exportedCtx;
  }

  /**
   * Returns an object that can be written to a file without data loss.
   * Contains fields needed for upgrading a node through separate commands
   * @param ctx - accumulator object
   * @returns file writable object
   */
  public static upgradeSaveContextParser(ctx: {config: NodeUpgradeConfigClass; upgradeZipHash: any}) {
    const exportedCtx: any = {};

    const config = /** @type {NodeUpgradeConfigClass} **/ ctx.config;
    exportedCtx.adminKey = config.adminKey.toString();
    exportedCtx.freezeAdminPrivateKey = config.freezeAdminPrivateKey.toString();
    exportedCtx.existingNodeAliases = config.existingNodeAliases;
    exportedCtx.upgradeZipHash = ctx.upgradeZipHash;
    exportedCtx.allNodeAliases = config.allNodeAliases;

    return exportedCtx;
  }

  /**
   * Initializes objects in the context from a provided string
   * Contains fields needed for updating a node through separate commands
   * @param ctx - accumulator object
   * @param ctxData - data in string format
   * @returns file writable object
   */
  public static upgradeLoadContextParser(ctx: {config: NodeUpgradeConfigClass; upgradeZipHash: any}, ctxData: any) {
    const config = ctx.config;

    config.freezeAdminPrivateKey = PrivateKey.fromStringED25519(ctxData.freezeAdminPrivateKey);
    config.adminKey = PrivateKey.fromStringED25519(ctxData.adminKey);
    config.existingNodeAliases = ctxData.existingNodeAliases;
    config.allNodeAliases = ctxData.allNodeAliases;
    ctx.upgradeZipHash = ctxData.upgradeZipHash;
    config.podRefs = {};
  }

  /**
   * Initializes objects in the context from a provided string
   * Contains fields needed for updating a node through separate commands
   * @param ctx - accumulator object
   * @param ctxData - data in string format
   * @returns file writable object
   */
  public static updateLoadContextParser(ctx: {config: NodeUpdateConfigClass; upgradeZipHash: any}, ctxData: any) {
    const config = ctx.config;

    if (ctxData.newAdminKey && ctxData.newAdminKey.length) {
      config.newAdminKey = PrivateKey.fromStringED25519(ctxData.newAdminKey);
    }

    config.freezeAdminPrivateKey = PrivateKey.fromStringED25519(ctxData.freezeAdminPrivateKey);
    config.treasuryKey = PrivateKey.fromStringED25519(ctxData.treasuryKey);
    config.adminKey = PrivateKey.fromStringED25519(ctxData.adminKey);
    config.existingNodeAliases = ctxData.existingNodeAliases;
    config.nodeAlias = ctxData.nodeAlias;
    config.newAccountNumber = ctxData.newAccountNumber;
    config.tlsPublicKey = ctxData.tlsPublicKey;
    config.tlsPrivateKey = ctxData.tlsPrivateKey;
    config.gossipPublicKey = ctxData.gossipPublicKey;
    config.gossipPrivateKey = ctxData.gossipPrivateKey;
    config.allNodeAliases = ctxData.allNodeAliases;
    ctx.upgradeZipHash = ctxData.upgradeZipHash;
    config.podRefs = {};
  }
}
