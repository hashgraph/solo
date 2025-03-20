// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/HelmExecutionBuilder.js';
import {type Options} from '../Options.js';

/**
 * Options for upgrading a Helm chart.
 */
export class UpgradeChartOptions implements Options {
  private readonly _namespace?: string;
  private readonly _kubeContext?: string;
  private readonly _reuseValues: boolean;

  constructor(namespace?: string, kubeContext?: string, reuseValues: boolean = false) {
    this._namespace = namespace;
    this._kubeContext = kubeContext;
    this._reuseValues = reuseValues;
  }

  /**
   * Gets the namespace where the release should be upgraded.
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
   * Gets whether to reuse the last release's values.
   * @returns True if values should be reused, false otherwise.
   */
  get reuseValues(): boolean {
    return this._reuseValues;
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
    if (this._reuseValues) {
      builder.flag('--reuse-values');
    }
  }

  /**
   * Creates a new builder instance.
   * @returns A new {@link UpgradeChartOptionsBuilder} instance.
   */
  public static builder(): UpgradeChartOptionsBuilder {
    return UpgradeChartOptionsBuilder.builder();
  }

  /**
   * Creates a new builder instance with default values.
   * @returns A new {@link UpgradeChartOptionsBuilder} instance with default values.
   */
  public static defaults(): UpgradeChartOptions {
    return UpgradeChartOptionsBuilder.builder().build();
  }
}

/**
 * Builder for {@link UpgradeChartOptions}.
 */
export class UpgradeChartOptionsBuilder {
  _namespace?: string;
  _kubeContext?: string;
  _reuseValues = false;

  private constructor() {}

  public static builder(): UpgradeChartOptionsBuilder {
    return new UpgradeChartOptionsBuilder();
  }

  /**
   * Sets the namespace where the release should be upgraded.
   * @param namespace The namespace.
   * @returns This builder instance.
   */
  public namespace(namespace: string): UpgradeChartOptionsBuilder {
    this._namespace = namespace;
    return this;
  }

  /**
   * Sets the Kubernetes context to use.
   * @param context The Kubernetes context.
   * @returns This builder instance.
   */
  public kubeContext(context: string): UpgradeChartOptionsBuilder {
    this._kubeContext = context;
    return this;
  }

  /**
   * Sets whether to reuse the last release's values.
   * @param reuse Whether to reuse values.
   * @returns This builder instance.
   */
  public reuseValues(reuse: boolean): UpgradeChartOptionsBuilder {
    this._reuseValues = reuse;
    return this;
  }

  public build(): UpgradeChartOptions {
    return new UpgradeChartOptions(this._namespace, this._kubeContext, this._reuseValues);
  }
}
