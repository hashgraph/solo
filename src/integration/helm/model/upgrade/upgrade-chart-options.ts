// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type Options} from '../options.js';

/**
 * Options for upgrading a Helm chart.
 */
export class UpgradeChartOptions implements Options {
  private readonly _namespace?: string;
  private readonly _kubeContext?: string;
  private readonly _reuseValues?: boolean;
  private readonly _valueArguments: string[];
  private readonly _version?: string;
  private readonly _install?: boolean;
  private readonly _createNamespace?: boolean;
  private readonly _dependencyUpdate?: boolean;
  private readonly _environmentVariables: Record<string, string>;

  public constructor(
    namespace?: string,
    kubeContext?: string,
    reuseValues: boolean = false,
    valueArguments: string[] = [],
    version?: string,
    install: boolean = false,
    createNamespace: boolean = false,
    dependencyUpdate: boolean = false,
    environmentVariables: Record<string, string> = {},
  ) {
    this._namespace = namespace;
    this._kubeContext = kubeContext;
    this._reuseValues = reuseValues;
    this._valueArguments = [...valueArguments];
    this._version = version;
    this._install = install;
    this._createNamespace = createNamespace;
    this._dependencyUpdate = dependencyUpdate;
    this._environmentVariables = {...environmentVariables};
  }

  /**
   * Gets the namespace where the release should be upgraded.
   * @returns The namespace or undefined if not set.
   */
  public get namespace(): string | undefined {
    return this._namespace;
  }

  /**
   * Gets the Kubernetes context to use.
   * @returns The Kubernetes context or undefined if not set.
   */
  public get kubeContext(): string | undefined {
    return this._kubeContext;
  }

  /**
   * Gets whether to reuse the last release's values.
   * @returns True if values should be reused, false otherwise.
   */
  public get reuseValues(): boolean {
    return this._reuseValues;
  }

  /**
   * Gets ordered Helm value arguments.
   * @returns The ordered Helm value arguments.
   */
  public get valueArguments(): string[] {
    return [...this._valueArguments];
  }

  /**
   * Gets the version of the chart to upgrade to.
   * @returns The version or undefined if not set.
   */
  public get version(): string {
    return this._version;
  }

  /**
   * Gets whether to perform an install during upgrade if the release is not created
   */
  public get install(): boolean {
    return this._install;
  }

  /**
   * Gets whether to create the namespace if it's not found
   */
  public get createNamespace(): boolean {
    return this._createNamespace;
  }

  /**
   * Gets whether to run helm dependency update before upgrading
   */
  public get dependencyUpdate(): boolean {
    return this._dependencyUpdate;
  }

  /**
   * Applies the options to the given builder.
   * @param builder The builder to apply the options to.
   */
  public apply(builder: HelmExecutionBuilder): void {
    builder.argument('output', 'json');

    if (this.namespace) {
      builder.argument('namespace', this.namespace);
    }

    if (this.kubeContext) {
      builder.argument('kube-context', this.kubeContext);
    }

    if (this.reuseValues) {
      builder.flag('--reuse-values');
    }

    if (this.install) {
      builder.flag('--install');
    }

    if (this.createNamespace) {
      builder.flag('--create-namespace');
    }

    if (this.dependencyUpdate) {
      builder.flag('--dependency-update');
    }

    if (this.valueArguments.length > 0) {
      builder.arguments(...this.valueArguments);
    }

    for (const [name, value] of Object.entries(this._environmentVariables)) {
      builder.environmentVariable(name, value);
    }

    if (this.version) {
      builder.argument('version', this.version);
    }
  }
}
