// SPDX-License-Identifier: Apache-2.0

import {ImageCacheHandler} from './image-cache-handler.js';
import {YamlImageTargetProvider} from '../target-providers/yaml-image-target-provider.js';
import {type CacheTargetProvider} from '../target-providers/cache-target-provider.js';
import {type ContainerEngineClient} from '../../container-engine/container-engine-client.js';
import {CacheProviderNotConfiguredError} from '../errors/cache-provider-not-configured-error.js';

/**
 * Builder for {@link ImageCacheHandler}.
 *
 * This builder allows runtime construction of an image cache handler by
 * creating a YAML-backed target provider from a file path.
 */
export class ImageCacheHandlerBuilder {
  private _provider?: CacheTargetProvider;
  private _engine?: ContainerEngineClient;

  private get name(): string {
    return this.constructor.name;
  }

  /**
   * Creates a new builder preconfigured with a YAML-backed image target provider.
   *
   * @param filePath path to the image targets YAML file
   * @returns a new builder instance
   */
  public static fromYaml(filePath: string): ImageCacheHandlerBuilder {
    return new ImageCacheHandlerBuilder().yamlProvider(filePath);
  }

  /**
   * Creates and sets a YAML-backed image target provider using the given file path.
   *
   * @param filePath path to the image targets YAML file
   * @returns this builder
   */
  private yamlProvider(filePath: string): ImageCacheHandlerBuilder {
    this._provider = new YamlImageTargetProvider(filePath);
    return this;
  }

  /**
   * Sets the container engine client to be used by the handler.
   *
   * @param engine container engine client
   * @returns this builder
   */
  public engine(engine: ContainerEngineClient): ImageCacheHandlerBuilder {
    this._engine = engine;
    return this;
  }

  /**
   * Builds a ready-to-use {@link ImageCacheHandler}.
   *
   * @returns the configured image cache handler
   * @throws Error if any required dependency is missing
   */
  public build(): ImageCacheHandler {
    if (!this._provider) {
      throw new CacheProviderNotConfiguredError(this.name, 'provider');
    }
    if (!this._engine) {
      throw new CacheProviderNotConfiguredError(this.name, 'engine');
    }

    return new ImageCacheHandler(this._engine, this._provider);
  }
}
