// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../core/errors/solo-errors.js';
import {type MirrorNodeModuleImageReference} from './mirror-node-module-image-reference.js';

/**
 * Mirror Node's build publishes six distinct images (`hedera-mirror-importer`, `-grpc`, `-rest`,
 * `-rest-java`, `-web3`, `-monitor`). `--component-image` for Mirror Node is treated as a repository
 * prefix (e.g. `ghcr.io/hiero-ledger/hedera-mirror:0.157.0-abc1234`) and expanded into the six module
 * images, preserving the `rest-java` (image suffix) to `restjava` (Helm chart key) mapping already
 * used by the legacy-image fallback in `MirrorNodeCommand`.
 *
 * A reference whose repository already ends in one of the six module suffixes (e.g.
 * `gcr.io/mirrornode/hedera-mirror-importer:0.150.0`) is treated as an explicit, already-resolved
 * single image rather than a prefix to expand further, and is applied verbatim to every chart key.
 * This preserves the pre-expansion behavior for callers passing a single registry reference.
 */
export class MirrorNodeModuleImages {
  private static readonly MODULES: {chartKey: string; dockerSuffix: string}[] = [
    {chartKey: 'importer', dockerSuffix: 'importer'},
    {chartKey: 'grpc', dockerSuffix: 'grpc'},
    {chartKey: 'rest', dockerSuffix: 'rest'},
    {chartKey: 'restjava', dockerSuffix: 'rest-java'},
    {chartKey: 'web3', dockerSuffix: 'web3'},
    {chartKey: 'monitor', dockerSuffix: 'monitor'},
  ];

  /**
   * Expands a Mirror Node `--component-image` repository prefix into the six per-module image
   * references, inserting `-<module>` before the tag. Tag detection mirrors
   * `ImageReference.parseImageReference` (`hasTag = lastColon > lastSlash`, default tag `latest`
   * when absent): a Kind-attached local registry reference's port colon is never mistaken for a tag
   * separator, and an untagged reference defaults to `latest` instead of being rejected, preserving
   * the behavior `ImageReference.parseImageReference` already applied to this flag before Mirror
   * Node's six-image expansion existed.
   */
  public static expand(componentImage: string): MirrorNodeModuleImageReference[] {
    if (componentImage.includes('@')) {
      throw new SoloErrors.validation.illegalArgument(
        `Mirror Node --component-image must be a tagged repository prefix, not a digest: '${componentImage}'`,
        componentImage,
      );
    }
    if (!componentImage.includes('/') && !componentImage.includes(':')) {
      throw new SoloErrors.validation.illegalArgument(
        `Invalid Mirror Node image reference format: '${componentImage}'`,
        componentImage,
      );
    }

    const lastSlashIndex: number = componentImage.lastIndexOf('/');
    const lastColonIndex: number = componentImage.lastIndexOf(':');
    const hasTag: boolean = lastColonIndex > lastSlashIndex;

    const repositoryPrefix: string = hasTag ? componentImage.slice(0, lastColonIndex) : componentImage;
    const tag: string = hasTag ? componentImage.slice(lastColonIndex + 1) : 'latest';

    const isExplicitSingleModuleReference: boolean = MirrorNodeModuleImages.MODULES.some(({dockerSuffix}): boolean =>
      repositoryPrefix.endsWith(`-${dockerSuffix}`),
    );
    if (isExplicitSingleModuleReference) {
      const imageReference: string = `${repositoryPrefix}:${tag}`;
      return MirrorNodeModuleImages.MODULES.map(({chartKey}): MirrorNodeModuleImageReference => ({
        chartKey,
        imageReference,
      }));
    }

    return MirrorNodeModuleImages.MODULES.map(({chartKey, dockerSuffix}): MirrorNodeModuleImageReference => ({
      chartKey,
      imageReference: `${repositoryPrefix}-${dockerSuffix}:${tag}`,
    }));
  }
}
