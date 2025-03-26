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
  private readonly _extraArgs?: string;
  private readonly _version?: string;

  constructor(
    namespace?: string,
    kubeContext?: string,
    reuseValues: boolean = false,
    extraArgs?: string,
    version?: string,
  ) {
    this._namespace = namespace;
    this._kubeContext = kubeContext;
    this._reuseValues = reuseValues;
    this._extraArgs = extraArgs;
    this._version = version;
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
   * Gets additional arguments to pass to the helm command.
   * @returns The additional arguments or undefined if not set.
   */
  get extraArgs(): string | undefined {
    return this._extraArgs;
  }

  /**
   * Gets the version of the chart to upgrade to.
   * @returns The version or undefined if not set.
   */
  get version(): string | undefined {
    return this._version;
  }

  /**
   * Applies the options to the given builder.
   * @param builder The builder to apply the options to.
   */
  apply(builder: HelmExecutionBuilder): void {
    builder.argument('output', 'json');

    if (this._namespace) {
      builder.argument('namespace', this._namespace);
    }
    if (this._kubeContext) {
      builder.argument('kube-context', this._kubeContext);
    }
    if (this._reuseValues) {
      builder.flag('--reuse-values');
    }
    if (this._extraArgs) {
      builder.positional(this._extraArgs);
    }

    if (this._version) {
      builder.argument('version', this._version);
    }
  }
}
