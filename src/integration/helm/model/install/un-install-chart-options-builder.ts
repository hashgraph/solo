// SPDX-License-Identifier: Apache-2.0

import {UnInstallChartOptions} from './un-install-chart-options.js';

/**
 * Builder for {@link UnInstallChartOptions}.
 */
export class UnInstallChartOptionsBuilder {
  _namespace?: string;
  _kubeContext?: string;

  private constructor() {}

  public static builder(): UnInstallChartOptionsBuilder {
    return new UnInstallChartOptionsBuilder();
  }

  /**
   * Sets the namespace where the release should be uninstalled.
   * @param namespace The namespace.
   * @returns This builder instance.
   */
  public namespace(namespace: string): UnInstallChartOptionsBuilder {
    this._namespace = namespace;
    return this;
  }

  /**
   * Sets the Kubernetes context to use.
   * @param context The Kubernetes context.
   * @returns This builder instance.
   */
  public kubeContext(context: string): UnInstallChartOptionsBuilder {
    this._kubeContext = context;
    return this;
  }

  public build(): UnInstallChartOptions {
    return new UnInstallChartOptions(this._namespace, this._kubeContext);
  }
}
