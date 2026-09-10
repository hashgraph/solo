// SPDX-License-Identifier: Apache-2.0

import {type CacheImageTemplateValuesStructure} from '../cache-image-template-values-structure.js';

export class CacheImageTemplateValues implements CacheImageTemplateValuesStructure {
  public readonly MIRROR_NODE_VERSION: string;
  public readonly BLOCK_NODE_VERSION: string;
  public readonly RELAY_VERSION: string;
  public readonly EXPLORER_VERSION: string;
  public readonly MINIO_OPERATOR_VERSION: string;
  public readonly SOLO_CHEETAH_VERSION: string;
  public readonly SOLO_CONTAINERS_VERSION: string;

  public constructor(
    mirrorNodeVersion: string,
    blockNodeVersion: string,
    relayVersion: string,
    explorerVersion: string,
    minioOperatorVersion: string,
    soloCheetahVersion: string,
    soloContainersVersion: string,
  ) {
    this.MIRROR_NODE_VERSION = this.removeVPrefix(mirrorNodeVersion);
    this.BLOCK_NODE_VERSION = this.removeVPrefix(blockNodeVersion);
    this.RELAY_VERSION = this.removeVPrefix(relayVersion);
    this.EXPLORER_VERSION = this.removeVPrefix(explorerVersion);
    this.MINIO_OPERATOR_VERSION = this.ensureVPrefix(minioOperatorVersion);
    this.SOLO_CHEETAH_VERSION = this.removeVPrefix(soloCheetahVersion);
    this.SOLO_CONTAINERS_VERSION = this.removeVPrefix(soloContainersVersion);
  }

  /**
   * Remove the 'v' prefix from the version string.
   * ex. v0.1.0 -> 0.1.0
   */
  private removeVPrefix(version: string): string {
    return version.replace(/^v/, '');
  }

  /**
   * Add the 'v' prefix if missing.
   * ex. 7.1.1 -> v7.1.1
   */
  private ensureVPrefix(version: string): string {
    return version.startsWith('v') ? version : `v${version}`;
  }
}
