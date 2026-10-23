// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../../core/dependency-injection/container-helper.js';
import {type ConfigProvider} from '../../../../data/configuration/api/config-provider.js';
import {FeatureFlagsSchema} from '../../../../data/schema/model/solo/feature-flags-schema.js';
import {SoloConfigSchema} from '../../../../data/schema/model/solo/solo-config-schema.js';

/** See {@code docs/contributing/feature-flags.md}. */
@injectable()
export class FeatureFlags {
  public constructor(@inject(InjectTokens.ConfigProvider) private readonly configProvider?: ConfigProvider) {
    this.configProvider = patchInject(configProvider, InjectTokens.ConfigProvider, this.constructor.name);
  }

  public get copyWrapsLibraryInParallel(): boolean {
    return this.currentFlags.copyWrapsLibraryInParallel;
  }

  public get skipNodePing(): boolean {
    return this.currentFlags.skipNodePing;
  }

  public get disableBlockNodeIntegration(): boolean {
    return this.currentFlags.disableBlockNodeIntegration;
  }

  public get enableImageCache(): boolean {
    return this.currentFlags.enableImageCache;
  }

  /**
   * Re-read on every access, never captured. This is a DI singleton, so it is constructed during container
   * initialisation — before {@code main()} loads the config sources. A value captured in the constructor
   * would be the schema default forever, whatever the environment said.
   *
   * <p>Memoizing was considered and rejected: {@link ConfigProvider} hands back the same {@code Config}
   * object across {@code refresh()} with no invalidation event, so a cache populated before the first
   * refresh would pin every flag to its default — reintroducing the bug this design avoids. Each read is a
   * walk of the {@code SOLO_*} keys only, and the hottest caller runs tens of times per invocation.
   */
  private get currentFlags(): FeatureFlagsSchema {
    return FeatureFlagsSchema.withDefaults(this.configProvider.config().asObject(SoloConfigSchema)?.featureFlags);
  }
}
