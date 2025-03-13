// SPDX-License-Identifier: Apache-2.0

import {type InstallChartOptions} from './InstallChartOptions.js';
import {assertNotNull} from '../../HelmClient.js';

/**
 * Builder for creating InstallChartOptions instances.
 */
export class InstallChartOptionsBuilder {
  private options: Partial<InstallChartOptions> = {};

  /**
   * Sets the namespace for the installation.
   * @param namespace The namespace to install into
   */
  public withNamespace(namespace: string): this {
    assertNotNull(namespace, 'namespace must not be null');
    this.options.namespace = namespace.trim();
    return this;
  }

  /**
   * Sets whether to wait for the installation to complete.
   * @param wait Whether to wait
   */
  public withWait(wait: boolean): this {
    this.options.wait = wait;
    return this;
  }

  /**
   * Sets the timeout duration in seconds.
   * @param timeout Timeout in seconds
   */
  public withTimeout(timeout: number): this {
    if (timeout < 0) {
      throw new Error('timeout must be non-negative');
    }
    this.options.timeout = timeout;
    return this;
  }

  /**
   * Sets whether to create the namespace if it doesn't exist.
   * @param createNamespace Whether to create namespace
   */
  public withCreateNamespace(createNamespace: boolean): this {
    this.options.createNamespace = createNamespace;
    return this;
  }

  /**
   * Builds the InstallChartOptions instance.
   * @returns A new InstallChartOptions instance
   */
  public build(): InstallChartOptions {
    return this.options as InstallChartOptions;
  }

  /**
   * Creates a new builder with default options.
   * @returns A new InstallChartOptionsBuilder instance
   */
  public static defaults(): InstallChartOptionsBuilder {
    return new InstallChartOptionsBuilder()
      .withWait(true)
      .withTimeout(300)
      .withCreateNamespace(false);
  }
}
