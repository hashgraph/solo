// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/HelmExecutionBuilder.js';
import {type Options} from '../Options.js';

/**
 * Options for uninstalling a Helm chart.
 */
export class UnInstallChartOptions implements Options {
  private readonly _namespace?: string;
  private readonly _kubeContext?: string;

  constructor(namespace?: string, kubeContext?: string) {
    this._namespace = namespace;
    this._kubeContext = kubeContext;
  }

  /**
   * Gets the namespace where the release should be uninstalled.
   * @returns The namespace or undefined if not set.
   */
  get namespace(): string | undefined {
    return this._namespace;
  }

  /**
   * Gets the Kubernetes context to use.
   * @returns The Kubernetes context or undefined if not set.
   */
  get kubeContext(): string | undefined {
    return this._kubeContext;
  }

  /**
   * Applies the options to the given builder.
   * @param builder The builder to apply the options to.
   */
  apply(builder: HelmExecutionBuilder): void {
    if (this._namespace) {
      builder.argument('namespace', this._namespace);
    }
    if (this._kubeContext) {
      builder.argument('kube-context', this._kubeContext);
    }
  }

  /**
   * Creates a new builder instance.
   * @returns A new {@link UnInstallChartOptionsBuilder} instance.
   */
  public static builder(): UnInstallChartOptionsBuilder {
    return UnInstallChartOptionsBuilder.builder();
  }

  /**
   * Creates a new builder instance with default values.
   * @param releaseName The name of the release to uninstall.
   * @returns A new {@link UnInstallChartOptionsBuilder} instance with default values.
   */
  public static defaults(): UnInstallChartOptions {
    return UnInstallChartOptionsBuilder.builder().build();
  }
}

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
