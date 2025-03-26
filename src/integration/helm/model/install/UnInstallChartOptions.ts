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
}
