// SPDX-License-Identifier: Apache-2.0

import {UpgradeChartOptions} from './upgrade-chart-options.js';

/**
 * Builder for {@link UpgradeChartOptions}.
 */
export class UpgradeChartOptionsBuilder {
  private _namespace?: string;
  private _kubeContext?: string;
  private _reuseValues: boolean = false;
  private _valueArguments: string[] = [];
  private _environmentVariables: Record<string, string> = {};
  private _version?: string;
  private _install: boolean = false;
  private _createNamespace: boolean = false;
  private _dependencyUpdate: boolean = false;

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

  /**
   * Sets ordered Helm value arguments.
   * @param valueArguments Ordered Helm value arguments.
   * @returns This builder instance.
   */
  public valueArguments(valueArguments: string[]): UpgradeChartOptionsBuilder {
    this._valueArguments = [...valueArguments];
    return this;
  }

  /**
   * Specify whether to install if release is not found
   * @param install
   */
  public install(install: boolean): UpgradeChartOptionsBuilder {
    this._install = install;
    return this;
  }

  /**
   * Specify whether to create the namespace if not found
   * @param createNamespace
   */
  public createNamespace(createNamespace: boolean): UpgradeChartOptionsBuilder {
    this._createNamespace = createNamespace;
    return this;
  }

  /**
   * Sets the version of the chart to upgrade to.
   * @param version The version.
   * @returns This builder instance.
   */
  public version(version: string): UpgradeChartOptionsBuilder {
    this._version = version;
    return this;
  }

  /**
   * Sets whether to run helm dependency update before upgrading.
   * @param dependencyUpdate Whether to update dependencies.
   * @returns This builder instance.
   */
  public dependencyUpdate(dependencyUpdate: boolean): UpgradeChartOptionsBuilder {
    this._dependencyUpdate = dependencyUpdate;
    return this;
  }

  /**
   * Sets the environment variables of the Helm process.
   * @param environmentVariables The environment variables.
   * @returns This builder instance.
   */
  public environmentVariables(environmentVariables: Record<string, string>): UpgradeChartOptionsBuilder {
    this._environmentVariables = {...environmentVariables};
    return this;
  }

  public build(): UpgradeChartOptions {
    return new UpgradeChartOptions(
      this._namespace,
      this._kubeContext,
      this._reuseValues,
      [...this._valueArguments],
      this._version,
      this._install,
      this._createNamespace,
      this._dependencyUpdate,
      {...this._environmentVariables},
    );
  }
}
