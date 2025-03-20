// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/HelmExecutionBuilder.js';
import {type Options} from '../Options.js';

/**
 * Options for uninstalling a Helm chart.
 */
export class UnInstallChartOptions implements Options {
  private readonly _namespace?: string;
  private readonly _kubeContext?: string;
  private readonly _releaseName: string;

  constructor(releaseName: string, namespace?: string, kubeContext?: string) {
    this._releaseName = releaseName;
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
   * Gets the name of the release to uninstall.
   * @returns The release name.
   */
  get releaseName(): string {
    return this._releaseName;
  }

  /**
   * Applies the options to the given builder.
   * @param builder The builder to apply the options to.
   */
  apply(builder: HelmExecutionBuilder): void {
    builder.argument('output', 'json');

    if (this._namespace) {
      builder.argument('--namespace', this._namespace);
    }
    if (this._kubeContext) {
      builder.argument('--kube-context', this._kubeContext);
    }

    // Release name is a required positional argument
    builder.positional(this._releaseName);
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
  public static defaults(releaseName: string): UnInstallChartOptions {
    return UnInstallChartOptionsBuilder.builder().releaseName(releaseName).build();
  }
}

/**
 * Builder for {@link UnInstallChartOptions}.
 */
export class UnInstallChartOptionsBuilder {
  _namespace?: string;
  _kubeContext?: string;
  _releaseName?: string;

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

  /**
   * Sets the name of the release to uninstall.
   * @param name The release name.
   * @returns This builder instance.
   */
  public releaseName(name: string): UnInstallChartOptionsBuilder {
    this._releaseName = name;
    return this;
  }

  public build(): UnInstallChartOptions {
    if (!this._releaseName) {
      throw new Error('Release name is required');
    }
    return new UnInstallChartOptions(this._releaseName, this._namespace, this._kubeContext);
  }
}
