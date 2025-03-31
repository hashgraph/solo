// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type Options} from '../options.js';

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
 * @param kubeContext      - the Kubernetes context to use.
 * @param namespace        - the namespace to install the chart in.
 * @param extraArgs        - additional arguments to pass to the helm command.
 */
export class InstallChartOptions implements Options {
  /**
   * if set, the installation process deletes the installation on failure. The --wait flag will
   * be set automatically if --atomic is used.
   */
  private readonly _atomic: boolean;

  /**
   * create the release namespace if not present.
   */
  private readonly _createNamespace: boolean;

  /**
   * update dependencies if they are missing before installing the chart.
   */
  private readonly _dependencyUpdate: boolean;

  /**
   * add a custom description.
   */
  private readonly _description: string | null;

  /**
   * enable DNS lookups when rendering templates.
   */
  private readonly _enableDNS: boolean;

  /**
   * force resource updates through a replacement strategy.
   */
  private readonly _force: boolean;

  /**
   * pass credentials to all domains.
   */
  private readonly _passCredentials: boolean;

  /**
   * chart repository password where to locate the requested chart.
   */
  private readonly _password: string | null;

  /**
   * chart repository url where to locate the requested chart.
   */
  private readonly _repo: string | null;

  /**
   * set values on the command line (can specify multiple or separate values with commas: key1=val1,key2=val2)
   */
  private readonly _set: string[] | null;

  /**
   * if set, no CRDs will be installed. By default, CRDs are installed if not already present.
   */
  private readonly _skipCrds: boolean;

  /**
   * time to wait for any individual Kubernetes operation (like Jobs for hooks) (default 5m0s).
   */
  private readonly _timeout: string | null;

  /**
   * chart repository username where to locate the requested chart.
   */
  private readonly _username: string | null;

  /**
   * specify values in a YAML file or a URL (can specify multiple).
   */
  private readonly _values: string[] | null;

  /**
   * verify the package before installing it.
   */
  private readonly _verify: boolean;

  /**
   * specify a version constraint for the chart version to use. This constraint can be a
   * specific tag (e.g. 1.1.1) or it may reference a valid range (e.g. ^2.0.0). If this is not
   * specified, the latest version is used.
   */
  private readonly _version: string | null;

  /**
   * if set, will wait until all Pods, PVCs, Services, and minimum number of Pods of a
   * Deployment, StatefulSet, or ReplicaSet are in a ready state before marking the release as
   * successful. It will wait for as long as --timeout.
   */
  private readonly _waitFor: boolean;

  /**
   * The Kubernetes context to use.
   */
  private readonly _kubeContext: string | null;

  /**
   * The namespace to install the chart in.
   */
  private readonly _namespace: string | null;

  /**
   * Additional arguments to pass to the helm command.
   */
  private readonly _extraArgs: string | null;

  constructor(
    atomic: boolean,
    createNamespace: boolean,
    dependencyUpdate: boolean,
    description: string | null,
    enableDNS: boolean,
    force: boolean,
    passCredentials: boolean,
    password: string | null,
    repo: string | null,
    set: string[] | null,
    skipCrds: boolean,
    timeout: string | null,
    username: string | null,
    values: string[] | null,
    verify: boolean,
    version: string | null,
    waitFor: boolean,
    kubeContext: string | null,
    namespace: string | null,
    extraArgs: string | null,
  ) {
    this._atomic = atomic;
    this._createNamespace = createNamespace;
    this._dependencyUpdate = dependencyUpdate;
    this._description = description;
    this._enableDNS = enableDNS;
    this._force = force;
    this._passCredentials = passCredentials;
    this._password = password;
    this._repo = repo;
    this._set = set;
    this._skipCrds = skipCrds;
    this._timeout = timeout;
    this._username = username;
    this._values = values;
    this._verify = verify;
    this._version = version;
    this._waitFor = waitFor;
    this._kubeContext = kubeContext;
    this._namespace = namespace;
    this._extraArgs = extraArgs;
  }

  public get namespace(): string | null {
    return this._namespace;
  }

  public apply(builder: HelmExecutionBuilder): void {
    this.applyFlags(builder);

    builder.argument('output', 'json');

    if (this._password) {
      builder.argument('password', this._password);
    }

    if (this._repo) {
      builder.argument('repo', this._repo);
    }

    if (this._set) {
      builder.optionsWithMultipleValues('set', this._set);
    }

    if (this._timeout) {
      builder.argument('timeout', this._timeout);
    }

    if (this._username) {
      builder.argument('username', this._username);
    }

    if (this._values) {
      builder.optionsWithMultipleValues('values', this._values);
    }

    if (this._kubeContext) {
      builder.argument('kube-context', this._kubeContext);
    }

    if (this._namespace) {
      builder.argument('namespace', this._namespace);
    }

    if (this._extraArgs) {
      builder.positional(this._extraArgs);
    }

    if (this._version) {
      builder.argument('version', this._version);
    }
  }

  private applyFlags(builder: HelmExecutionBuilder): void {
    if (this._atomic) {
      builder.flag('--atomic');
    }

    if (this._createNamespace) {
      builder.flag('--create-namespace');
    }

    if (this._dependencyUpdate) {
      builder.flag('--dependency-update');
    }

    if (this._enableDNS) {
      builder.flag('--enable-dns');
    }

    if (this._force) {
      builder.flag('--force');
    }

    if (this._passCredentials) {
      builder.flag('--pass-credentials');
    }

    if (this._skipCrds) {
      builder.flag('--skip-crds');
    }

    if (this._verify) {
      builder.flag('--verify');
    }

    if (this._waitFor) {
      builder.flag('--wait');
    }
  }

  public get atomic(): boolean {
    return this._atomic;
  }

  public get createNamespace(): boolean {
    return this._createNamespace;
  }

  public get dependencyUpdate(): boolean {
    return this._dependencyUpdate;
  }

  public get description(): string | null {
    return this._description;
  }

  public get enableDNS(): boolean {
    return this._enableDNS;
  }

  public get force(): boolean {
    return this._force;
  }

  public get passCredentials(): boolean {
    return this._passCredentials;
  }

  public get password(): string | null {
    return this._password;
  }

  public get repo(): string | null {
    return this._repo;
  }

  public get set(): string[] | null {
    return this._set;
  }

  public get skipCrds(): boolean {
    return this._skipCrds;
  }

  public get timeout(): string | null {
    return this._timeout;
  }

  public get username(): string | null {
    return this._username;
  }

  public get values(): string[] | null {
    return this._values;
  }

  public get verify(): boolean {
    return this._verify;
  }

  public get version(): string | null {
    return this._version;
  }

  public get waitFor(): boolean {
    return this._waitFor;
  }

  public get kubeContext(): string | null {
    return this._kubeContext;
  }

  public get extraArgs(): string | null {
    return this._extraArgs;
  }
}
