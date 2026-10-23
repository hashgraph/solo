// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, plainToInstance} from 'class-transformer';
import {EnvironmentAliasRegistry} from '../../decorators/environment-alias-registry.js';

/**
 * Boolean feature flags. See {@code docs/contributing/feature-flags.md}.
 *
 * <p>Defaults live here only — there is deliberately no {@code resources/config} file for feature flags,
 * so there is no second copy to drift out of step.
 */
@Exclude()
export class FeatureFlagsSchema {
  @Expose()
  @EnvironmentAliasRegistry.alias('EXPERIMENTAL_COPY_WRAPS_LIB_IN_PARALLEL')
  public copyWrapsLibraryInParallel: boolean;

  @Expose()
  @EnvironmentAliasRegistry.alias('SOLO_FF_SKIP_NODE_PING')
  @EnvironmentAliasRegistry.legacyAlias('SKIP_NODE_PING')
  public skipNodePing: boolean;

  @Expose()
  @EnvironmentAliasRegistry.alias('SOLO_FF_DISABLE_BLOCK_NODE_INTEGRATION')
  @EnvironmentAliasRegistry.legacyAlias('DISABLE_IMPORTER_SPRING_PROFILES')
  public disableBlockNodeIntegration: boolean;

  @Expose()
  @EnvironmentAliasRegistry.alias('SOLO_FF_ENABLE_IMAGE_CACHE')
  @EnvironmentAliasRegistry.legacyAlias('ENABLE_IMAGE_CACHE')
  public enableImageCache: boolean;

  public constructor(
    copyWrapsLibraryInParallel?: boolean,
    skipNodePing?: boolean,
    disableBlockNodeIntegration?: boolean,
    enableImageCache?: boolean,
  ) {
    this.copyWrapsLibraryInParallel = copyWrapsLibraryInParallel ?? false;
    this.skipNodePing = skipNodePing ?? false;
    this.disableBlockNodeIntegration = disableBlockNodeIntegration ?? false;
    this.enableImageCache = enableImageCache ?? true;
  }

  /**
   * A config source carries only the flags actually set, and class-transformer blanks every other exposed
   * property to {@code undefined} rather than keeping the constructor's value. Without this, setting any one
   * flag would read every other flag as falsy — {@code SKIP_NODE_PING=true} would also switch the image
   * cache off.
   *
   * <p>Apply this at the merged top level only. Pushing {@code exposeDefaultValues} down into
   * {@link ClassToObjectMapper} would make each source return defaults instead of {@code undefined}, and
   * {@code ReflectAssist.merge} skips only {@code undefined}/{@code null} — so the highest-ordinal source
   * would clobber every value set in {@code helm-chart-config.yaml} and {@code tss-config.yaml}.
   */
  public static withDefaults(configured?: Partial<FeatureFlagsSchema>): FeatureFlagsSchema {
    return plainToInstance(FeatureFlagsSchema, configured ?? {}, {exposeDefaultValues: true});
  }
}
