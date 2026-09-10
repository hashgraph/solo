// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';
import {EnvironmentAliasRegistry} from '../../decorators/environment-alias-registry.js';

@Exclude()
export class WrapsSchema {
  @Expose()
  public artifactsFolderName: string;

  @Expose()
  public directoryName: string;

  @Expose()
  public allowedKeyFiles: string;

  // IMPORTANT: libraryDownloadUrl must be kept consistent with directoryName.
  // If directoryName is updated, update libraryDownloadUrl to match.
  @Expose()
  @EnvironmentAliasRegistry.alias('SOLO_TSS_WRAPS_LIBRARY_DOWNLOAD_URL')
  public libraryDownloadUrl: string;

  public constructor(
    artifactsFolderName?: string,
    directoryName?: string,
    allowedKeyFiles?: string,
    libraryDownloadUrl?: string,
  ) {
    this.artifactsFolderName = artifactsFolderName ?? 'data/keys/wraps-v1.0.0';
    this.directoryName = directoryName ?? 'wraps-v1.0.0';
    this.allowedKeyFiles = allowedKeyFiles ?? 'decider_pp.bin,decider_vp.bin,nova_pp.bin,nova_vp.bin';
    this.libraryDownloadUrl =
      libraryDownloadUrl ?? 'https://builds.hedera.com/tss/hiero/wraps/v1.0/wraps-v1.0.0.tar.gz';
  }
}
