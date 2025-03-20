// SPDX-License-Identifier: Apache-2.0

import {type HelmClient} from '../HelmClient.js';
import {type HelmClientBuilder} from '../HelmClientBuilder.js';
import {KubeAuthentication} from '../request/authentication/KubeAuthentication.js';
import {DefaultHelmClient} from './DefaultHelmClient.js';

/**
 * The default implementation of the HelmClientBuilder interface.
 */
export class DefaultHelmClientBuilder implements HelmClientBuilder {
  /**
   * The default namespace to be set by the HelmClient. Defaults to a null value which indicates that
   * the Helm -n <namespace> argument should not be specified.
   */
  private _defaultNamespace?: string;

  /**
   * The working directory to be used by the HelmClient.
   */
  private _workingDirectory?: string;

  /**
   * The kubernetes API server address and port number to which the client should connect. Defaults to a null
   * value which indicates that the Helm --kube-apiserver <address_and_port> argument should not be specified.
   */
  private _kubeApiServer?: string;

  /**
   * The kubernetes CA certificate file. Defaults to a null value which indicates that the Helm
   * --kube-ca-file <ca_file> argument should not be specified.
   */
  private _kubeCAFile?: string;

  /**
   * The kubernetes context from the kube config file to be used. Defaults to a null value which indicates
   * that the Helm --kube-context <context> argument should not be specified.
   */
  private _kubeContext?: string;

  /**
   * Specifies whether the Helm client should skip TLS certificate verification. Defaults to a null value
   * which indicates that the Helm --kube-insecure-skip-tls-verify <bool> argument should not be specified.
   */
  private _kubeSkipTlsVerification?: boolean;

  /**
   * The kubernetes server name to use for TLS server certificate validation. Defaults to a null value
   * which indicates that the Helm --kube-tls-server-name <name> argument should not be specified.
   */
  private _kubeTlsServerName?: string;

  /**
   * The kubernetes bearer token to be used for authentication. Defaults to a null values which indicates that
   * the Helm --kube-token <token> argument should not be specified.
   */
  private _kubeToken?: string;

  /**
   * The path to the kube config file. Defaults to a null value which indicates that the Helm
   * --kubeconfig <context> argument should not be specified.
   */
  private _kubeConfig?: string;

  /**
   * Constructs a new builder instance and initializes it with the default configuration.
   */
  constructor() {}

  defaultNamespace(namespace: string): HelmClientBuilder {
    this._defaultNamespace = namespace;
    return this;
  }

  workingDirectory(workingDirectory: string): HelmClientBuilder {
    this._workingDirectory = workingDirectory;
    return this;
  }

  kubeApiServer(kubeApiServer: string): HelmClientBuilder {
    this._kubeApiServer = kubeApiServer;
    return this;
  }

  kubeCAFile(kubeCAFile: string): HelmClientBuilder {
    this._kubeCAFile = kubeCAFile;
    return this;
  }

  kubeContext(kubeContext: string): HelmClientBuilder {
    this._kubeContext = kubeContext;
    return this;
  }

  kubeSkipTlsVerification(kubeSkipTlsVerification: boolean): HelmClientBuilder {
    this._kubeSkipTlsVerification = kubeSkipTlsVerification;
    return this;
  }

  kubeTlsServerName(kubeTlsServerName: string): HelmClientBuilder {
    this._kubeTlsServerName = kubeTlsServerName;
    return this;
  }

  kubeToken(kubeToken: string): HelmClientBuilder {
    this._kubeToken = kubeToken;
    return this;
  }

  kubeConfig(kubeConfig: string): HelmClientBuilder {
    this._kubeConfig = kubeConfig;
    return this;
  }

  build(): HelmClient {
    const authentication = new KubeAuthentication(
      this._kubeApiServer,
      this._kubeCAFile,
      this._kubeContext,
      this._kubeSkipTlsVerification,
      this._kubeTlsServerName,
      this._kubeToken,
      this._kubeConfig,
    );

    return new DefaultHelmClient();
  }
}
