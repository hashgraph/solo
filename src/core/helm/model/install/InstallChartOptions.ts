// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/HelmExecutionBuilder.js';

/**
 * The options to be supplied to the helm install command.
 *
 * @param atomic           - if set, the installation process deletes the installation on failure. The --wait flag will
 *                         be set automatically if --atomic is used.
 * @param createNamespace  - create the release namespace if not present.
 * @param dependencyUpdate - update dependencies if they are missing before installing the chart.
 * @param description      - add a custom description.
 * @param enableDNS        - enable DNS lookups when rendering templates.
 * @param force            - force resource updates through a replacement strategy.
 * @param passCredentials  - pass credentials to all domains.
 * @param password         - chart repository password where to locate the requested chart.
 * @param repo             - chart repository url where to locate the requested chart.
 * @param set              - set values on the command line (can specify multiple or separate values with commas: key1=val1,key2=val2)
 * @param skipCrds         - if set, no CRDs will be installed. By default, CRDs are installed if not already present.
 * @param timeout          - time to wait for any individual Kubernetes operation (like Jobs for hooks) (default 5m0s).
 * @param username         - chart repository username where to locate the requested chart.
 * @param values           - specify values in a YAML file or a URL (can specify multiple).
 * @param verify           - verify the package before installing it.
 * @param version          - specify a version constraint for the chart version to use. This constraint can be a
 *                         specific tag (e.g. 1.1.1) or it may reference a valid range (e.g. ^2.0.0). If this is not
 *                         specified, the latest version is used.
 * @param waitFor          - if set, will wait until all Pods, PVCs, Services, and minimum number of Pods of a
 *                         Deployment, StatefulSet, or ReplicaSet are in a ready state before marking the release as
 *                         successful. It will wait for as long as --timeout.
 */
export class InstallChartOptions {
  constructor(
    public readonly atomic: boolean = false,
    public readonly createNamespace: boolean = false,
    public readonly dependencyUpdate: boolean = false,
    public readonly description?: string,
    public readonly enableDNS: boolean = false,
    public readonly force: boolean = false,
    public readonly passCredentials: boolean = false,
    public readonly password?: string,
    public readonly repo?: string,
    public readonly set?: string[],
    public readonly skipCrds: boolean = false,
    public readonly timeout?: string,
    public readonly username?: string,
    public readonly values?: string[],
    public readonly verify: boolean = false,
    public readonly version?: string,
    public readonly waitFor: boolean = false,
  ) {}

  /**
   * Creates a new builder for InstallChartOptions.
   */
  static builder(): InstallChartOptionsBuilder {
    return new InstallChartOptionsBuilder();
  }

  /**
   * Returns a new instance of InstallChartOptions with default values.
   */
  static defaults(): InstallChartOptions {
    return new InstallChartOptions();
  }

  /**
   * Applies the options to the given builder.
   * @param builder The builder to apply the options to
   */
  apply(builder: HelmExecutionBuilder): void {
    if (this.atomic) {
      builder.flag('atomic');
    }
    if (this.createNamespace) {
      builder.flag('create-namespace');
    }
    if (this.dependencyUpdate) {
      builder.flag('dependency-update');
    }
    if (this.description) {
      builder.argument('description', this.description);
    }
    if (this.enableDNS) {
      builder.flag('enable-dns');
    }
    if (this.force) {
      builder.flag('force');
    }
    if (this.passCredentials) {
      builder.flag('pass-credentials');
    }
    if (this.password) {
      builder.argument('password', this.password);
    }
    if (this.repo) {
      builder.argument('repo', this.repo);
    }
    if (this.set) {
      this.set.forEach(value => builder.argument('set', value));
    }
    if (this.skipCrds) {
      builder.flag('skip-crds');
    }
    if (this.timeout) {
      builder.argument('timeout', this.timeout);
    }
    if (this.username) {
      builder.argument('username', this.username);
    }
    if (this.values) {
      this.values.forEach(value => builder.argument('values', value));
    }
    if (this.verify) {
      builder.flag('verify');
    }
    if (this.version) {
      builder.argument('version', this.version);
    }
    if (this.waitFor) {
      builder.flag('wait');
    }
  }
}

/**
 * Builder for InstallChartOptions.
 */
export class InstallChartOptionsBuilder {
  private _atomic: boolean = false;
  private _createNamespace: boolean = false;
  private _dependencyUpdate: boolean = false;
  private _description?: string;
  private _enableDNS: boolean = false;
  private _force: boolean = false;
  private _passCredentials: boolean = false;
  private _password?: string;
  private _repo?: string;
  private _set?: string[];
  private _skipCrds: boolean = false;
  private _timeout?: string;
  private _username?: string;
  private _values?: string[];
  private _verify: boolean = false;
  private _version?: string;
  private _waitFor: boolean = false;

  /**
   * If set, the installation process deletes the installation on failure.
   * The --wait flag will be set automatically if --atomic is used.
   */
  atomic(value: boolean): InstallChartOptionsBuilder {
    this._atomic = value;
    return this;
  }

  /**
   * If set, create the release namespace if not present.
   */
  createNamespace(value: boolean): InstallChartOptionsBuilder {
    this._createNamespace = value;
    return this;
  }

  /**
   * If set, update dependencies if they are missing before installing the chart.
   */
  dependencyUpdate(value: boolean): InstallChartOptionsBuilder {
    this._dependencyUpdate = value;
    return this;
  }

  /**
   * Add a custom description.
   */
  description(value: string): InstallChartOptionsBuilder {
    this._description = value;
    return this;
  }

  /**
   * Enable DNS lookups.
   */
  enableDNS(value: boolean): InstallChartOptionsBuilder {
    this._enableDNS = value;
    return this;
  }

  /**
   * Force resource updates through a replacement strategy.
   */
  force(value: boolean): InstallChartOptionsBuilder {
    this._force = value;
    return this;
  }

  /**
   * Pass credentials to all domains.
   */
  passCredentials(value: boolean): InstallChartOptionsBuilder {
    this._passCredentials = value;
    return this;
  }

  /**
   * Chart repository password.
   */
  password(value: string): InstallChartOptionsBuilder {
    this._password = value;
    return this;
  }

  /**
   * Chart repository URL.
   */
  repo(value: string): InstallChartOptionsBuilder {
    this._repo = value;
    return this;
  }

  /**
   * Set values on the command line.
   */
  set(values: string[]): InstallChartOptionsBuilder {
    this._set = values;
    return this;
  }

  /**
   * If set, skip CRD installation.
   */
  skipCrds(value: boolean): InstallChartOptionsBuilder {
    this._skipCrds = value;
    return this;
  }

  /**
   * Time to wait for any individual Kubernetes operation.
   */
  timeout(value: string): InstallChartOptionsBuilder {
    this._timeout = value;
    return this;
  }

  /**
   * Chart repository username.
   */
  username(value: string): InstallChartOptionsBuilder {
    this._username = value;
    return this;
  }

  /**
   * Specify values in a YAML file or a URL.
   */
  values(fileValues: string[]): InstallChartOptionsBuilder {
    this._values = fileValues;
    return this;
  }

  /**
   * Verify the package before installing it.
   */
  verify(value: boolean): InstallChartOptionsBuilder {
    this._verify = value;
    return this;
  }

  /**
   * Specify a version constraint for the chart version to use.
   */
  version(value: string): InstallChartOptionsBuilder {
    this._version = value;
    return this;
  }

  /**
   * If set, will wait until all Pods, PVCs, Services, and minimum number of Pods
   * of a Deployment, StatefulSet, or ReplicaSet are in a ready state before marking
   * the release as successful.
   */
  waitFor(value: boolean): InstallChartOptionsBuilder {
    this._waitFor = value;
    return this;
  }

  /**
   * Build the InstallChartOptions instance.
   */
  build(): InstallChartOptions {
    return new InstallChartOptions(
      this._atomic,
      this._createNamespace,
      this._dependencyUpdate,
      this._description,
      this._enableDNS,
      this._force,
      this._passCredentials,
      this._password,
      this._repo,
      this._set,
      this._skipCrds,
      this._timeout,
      this._username,
      this._values,
      this._verify,
      this._version,
      this._waitFor,
    );
  }
}
