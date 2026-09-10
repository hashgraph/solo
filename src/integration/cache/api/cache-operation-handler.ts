// SPDX-License-Identifier: Apache-2.0

import {type CacheArtifactEnum} from '../enums/cache-artifact-enum.js';
import {type ArtifactHealthResultStructure} from '../models/artifact-health-result-structure.js';
import {type SoloListrTask} from '../../../types/index.js';
import {type AnyListrContext} from '../../../types/aliases.js';
import {type CachedItemStructure} from '../models/cached-item-structure.js';

/**
 * Strategy contract for handling one cache domain.
 *
 * Implementations encapsulate the full behavior for a specific artifact type,
 * for example:
 * - container images
 * - Helm charts
 *
 * This keeps domain-specific behavior out of the coordinator.
 */
export interface CacheOperationHandler {
  /**
   * Returns the artifact type handled by this strategy.
   */
  getType(): CacheArtifactEnum;

  /**
   * Pulls and stores the provided targets into the local cache.
   *
   * Implementations are responsible for:
   * - fetching the target from its source
   * - writing the local cached artifact
   * - returning the resulting cached items
   */
  pull(): Promise<SoloListrTask<AnyListrContext>[]>;

  /**
   * Loads cached items into their runtime or consumption environment.
   *
   * Examples:
   * - Docker images loaded into the local engine and optionally into a Kind cluster
   * - Helm charts prepared for downstream usage
   *
   * @param target runtime target, such as a cluster name
   */
  load(target: string): Promise<SoloListrTask<AnyListrContext>[]>;

  /**
   * Deletes cached items for this domain.
   *
   * Implementations should remove local cached files and any domain-specific
   * local runtime state when appropriate.
   */
  clear(): Promise<void>;

  /**
   * Performs a health check for the provided cached items.
   *
   * Implementations should validate that each cached item is still usable.
   */
  healthcheck(): Promise<readonly ArtifactHealthResultStructure[]>;

  /**
   * Returns the cache items this handler manages.
   *
   * This is a logical listing of the artifacts the handler expects in the cache.
   * It may be used by callers to inspect or report cache contents.
   */
  list(): Promise<readonly CachedItemStructure[]>;
}
