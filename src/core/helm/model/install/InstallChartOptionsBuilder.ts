// SPDX-License-Identifier: Apache-2.0

import {InstallChartOptions} from './InstallChartOptions.js';

/**
 * The builder for the InstallChartOptions.
 */
export class InstallChartOptionsBuilder {
  private _atomic = false;
  private _createNamespace = false;
  private _dependencyUpdate = false;
  private _description?: string;
  private _enableDNS = false;
  private _force = false;
  private _passCredentials = false;
  private _password?: string;
  private _repo?: string;
  private _set?: string[];
  private _skipCrds = false;
  private _timeout?: string;
  private _username?: string;
  private _values?: string[];
  private _verify = false;
  private _version?: string;
  private _waitFor = false;
  private _kubeContext?: string;
  private _namespace?: string;
  private _extraArgs?: string;

  private constructor() {}

  /**
   * Returns an instance of the InstallChartOptionsBuilder.
   * @returns the InstallChartOptionsBuilder.
   */
  public static builder(): InstallChartOptionsBuilder {
    return new InstallChartOptionsBuilder();
  }

  /**
   * if set, the installation process deletes the installation on failure. The --wait flag will be set automatically
   * if --atomic is used.
   *
   * @param atomic if set, the installation process deletes the installation on failure. The --wait flag will be set
   *              automatically if --atomic is used.
   * @returns the current InstallChartOptionsBuilder.
   */
  public atomic(atomic: boolean): InstallChartOptionsBuilder {
    this._atomic = atomic;
    return this;
  }

  /**
   * if set, create the release namespace if not present.
   *
   * @param createNamespace if set, create the release namespace if not present.
   * @returns the current InstallChartOptionsBuilder.
   */
  public createNamespace(createNamespace: boolean): InstallChartOptionsBuilder {
    this._createNamespace = createNamespace;
    return this;
  }

  /**
   * if set, update dependencies if they are missing before installing the chart.
   *
   * @param dependencyUpdate if set, update dependencies if they are missing before installing the chart.
   * @returns the current InstallChartOptionsBuilder.
   */
  public dependencyUpdate(dependencyUpdate: boolean): InstallChartOptionsBuilder {
    this._dependencyUpdate = dependencyUpdate;
    return this;
  }

  /**
   * add a custom description.
   *
   * @param description add a custom description.
   * @returns the current InstallChartOptionsBuilder.
   */
  public description(description: string): InstallChartOptionsBuilder {
    this._description = description;
    return this;
  }

  /**
   * enable DNS lookups when rendering templates.
   *
   * @param enableDNS enable DNS lookups when rendering templates.
   * @returns the current InstallChartOptionsBuilder.
   */
  public enableDNS(enableDNS: boolean): InstallChartOptionsBuilder {
    this._enableDNS = enableDNS;
    return this;
  }

  /**
   * if set, force resource updates through a replacement strategy.
   *
   * @param force if set, force resource updates through a replacement strategy.
   * @returns the current InstallChartOptionsBuilder.
   */
  public force(force: boolean): InstallChartOptionsBuilder {
    this._force = force;
    return this;
  }

  /**
   * pass credentials to all domains.
   *
   * @param passCredentials pass credentials to all domains.
   * @returns the current InstallChartOptionsBuilder.
   */
  public passCredentials(passCredentials: boolean): InstallChartOptionsBuilder {
    this._passCredentials = passCredentials;
    return this;
  }

  /**
   * chart repository password where to locate the requested chart.
   *
   * @param password chart repository password where to locate the requested chart.
   * @returns the current InstallChartOptionsBuilder.
   */
  public password(password: string): InstallChartOptionsBuilder {
    this._password = password;
    return this;
  }

  /**
   * chart repository url where to locate the requested chart.
   *
   * @param repo chart repository url where to locate the requested chart.
   * @returns the current InstallChartOptionsBuilder.
   */
  public repo(repo: string): InstallChartOptionsBuilder {
    this._repo = repo;
    return this;
  }

  /**
   * set values on the command line (can specify multiple or separate values with commas: key1=val1,key2=val2)
   *
   * @param valueOverride set values on the command line (can specify multiple or separate values with commas: key1=val1,key2=val2)
   * @returns the current InstallChartOptionsBuilder.
   */
  public set(valueOverride: string[]): InstallChartOptionsBuilder {
    this._set = valueOverride;
    return this;
  }

  /**
   * if set, no CRDs will be installed. By default, CRDs are installed if not already present.
   *
   * @param skipCrds if set, no CRDs will be installed. By default, CRDs are installed if not already present.
   * @returns the current InstallChartOptionsBuilder.
   */
  public skipCrds(skipCrds: boolean): InstallChartOptionsBuilder {
    this._skipCrds = skipCrds;
    return this;
  }

  /**
   * time to wait for any individual Kubernetes operation (like Jobs for hooks) (default 5m0s).
   *
   * @param timeout time to wait for any individual Kubernetes operation (like Jobs for hooks) (default 5m0s).
   * @returns the current InstallChartOptionsBuilder.
   */
  public timeout(timeout: string): InstallChartOptionsBuilder {
    this._timeout = timeout;
    return this;
  }

  /**
   * chart repository username where to locate the requested chart.
   *
   * @param username chart repository username where to locate the requested chart.
   * @returns the current InstallChartOptionsBuilder.
   */
  public username(username: string): InstallChartOptionsBuilder {
    this._username = username;
    return this;
  }

  /**
   * specify values in a YAML file or a URL (can specify multiple).
   *
   * @param values specify values in a YAML file or a URL (can specify multiple).
   * @returns the current InstallChartOptionsBuilder.
   */
  public values(values: string[]): InstallChartOptionsBuilder {
    this._values = values;
    return this;
  }

  /**
   * verify the package before installing it.
   *
   * @param verify verify the package before installing it.
   * @returns the current InstallChartOptionsBuilder.
   */
  public verify(verify: boolean): InstallChartOptionsBuilder {
    this._verify = verify;
    return this;
  }

  /**
   * specify a version constraint for the chart version to use. This constraint can be a specific tag (e.g. 1.1.1) or
   * it may reference a valid range (e.g. ^2.0.0). If this is not specified, the latest version is used.
   *
   * @param version specify a version constraint for the chart version to use. This constraint can be a specific tag
   *               (e.g. 1.1.1) or it may reference a valid range (e.g. ^2.0.0). If this is not specified, the latest
   *               version is used.
   * @returns the current InstallChartOptionsBuilder.
   */
  public version(version: string): InstallChartOptionsBuilder {
    this._version = version;
    return this;
  }

  /**
   * if set, will wait until all Pods, PVCs, Services, and minimum number of Pods of a Deployment, StatefulSet, or
   * ReplicaSet are in a ready state before marking the release as successful. It will wait for as long as --timeout.
   *
   * @param waitFor if set, will wait until all Pods, PVCs, Services, and minimum number of Pods of a Deployment,
   *               StatefulSet, or ReplicaSet are in a ready state before marking the release as successful. It will
   *               wait for as long as --timeout.
   * @returns the current InstallChartOptionsBuilder.
   */
  public waitFor(waitFor: boolean): InstallChartOptionsBuilder {
    this._waitFor = waitFor;
    return this;
  }

  /**
   * build the InstallChartOptions.
   * @returns the created InstallChartOptions.
   */
  /**
   * Sets the Kubernetes context to use.
   * @param context The Kubernetes context.
   * @returns This builder instance.
   */
  public kubeContext(context: string): InstallChartOptionsBuilder {
    this._kubeContext = context;
    return this;
  }

  /**
   * Set the namespace for the installation.
   *
   * @param namespace the namespace to install the chart in.
   * @returns the current InstallChartOptionsBuilder.
   */
  public namespace(namespace: string): InstallChartOptionsBuilder {
    this._namespace = namespace;
    return this;
  }

  /**
   * Sets additional arguments to pass to the helm command.
   * @param args The additional arguments.
   * @returns This builder instance.
   */
  public extraArgs(args: string): InstallChartOptionsBuilder {
    this._extraArgs = args;
    return this;
  }

  public build(): InstallChartOptions {
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
      this._kubeContext,
      this._namespace,
      this._extraArgs,
    );
  }
}
