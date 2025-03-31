// SPDX-License-Identifier: Apache-2.0

import {type HelmClient} from './helm-client.js';

/**
 * HelmClientBuilder is used to construct instances of HelmClient. This interface defines the standard
 * methods which all HelmClient builders must implement.
 *
 * @implNote The build() method is responsible for extracting the appropriate Helm executable
 * from the package. The Helm executable should be extracted to a temporary directory which is supplied to the
 * HelmClient implementation.
 * @see HelmClient
 */
export interface HelmClientBuilder {
  /**
   * Sets the default namespace for the HelmClient instance.
   *
   * @param namespace the Kubernetes namespace to use by default.
   * @returns the HelmClientBuilder instance.
   * @implNote The kubernetes cluster's default namespace is used if the namespace is not explicitly provided.
   * @implSpec This value should be used to set the --namespace <namespace> flag for all Helm commands unless
   * overridden by a specific HelmClient method.
   */
  defaultNamespace(namespace: string): HelmClientBuilder;

  /**
   * Sets the working directory for the HelmClient instance.
   * @param workingDirectory the working directory.
   * @returns the HelmClientBuilder instance.
   * @implNote The working directory is set to the pwd if not explicitly provided, if that fails it will use the
   * parent folder of the helm executable.
   */
  workingDirectory(workingDirectory: string): HelmClientBuilder;

  /**
   * Sets the Kubernetes API server address and port number for the HelmClient instance.
   *
   * @param kubeApiServer the Kubernetes API server address and port number.
   * @returns the HelmClientBuilder instance.
   * @implNote The Kubernetes API server address and port number are read from the Kubernetes configuration file if not
   * explicitly provided.
   * @implSpec This value should be used to set the --kube-apiserver <kubeApiServer> flag for all Helm commands.
   */
  kubeApiServer(kubeApiServer: string): HelmClientBuilder;

  /**
   * Sets the path to the Kubernetes CA certificate file for the HelmClient instance.
   *
   * @param kubeCAFile the path to the Kubernetes API server CA certificate file.
   * @returns the HelmClientBuilder instance.
   * @implNote The Kubernetes CA certificate file path is read from the Kubernetes configuration file if not explicitly
   * provided.
   * @implSpec This value should be used to set the --kube-ca-file <kubeCAFile> flag for all Helm commands.
   */
  kubeCAFile(kubeCAFile: string): HelmClientBuilder;

  /**
   * Sets the context defined in the kube config file to use for the HelmClient instance. If this value is not
   * provided, the current context is used.
   *
   * @param kubeContext the name of the context defined in the kube config file to use.
   * @returns the HelmClientBuilder instance.
   * @implNote The Kubernetes context is read from the Kubernetes configuration file if not explicitly provided.
   * @implSpec This value should be used to set the --kube-context <kubeContext> flag for all Helm commands.
   */
  kubeContext(kubeContext: string): HelmClientBuilder;

  /**
   * Sets whether to skip TLS verification when communicating with the Kubernetes API server for the HelmClient
   * instance.
   *
   * @param kubeSkipTlsVerification indicates whether to skip TLS verification when communicating with the Kubernetes API
   *                                server. This value may be null to indicate that the default value should be
   *                                used.
   * @returns the HelmClientBuilder instance.
   * @implNote The Kubernetes skip TLS verification flag is read from the Kubernetes configuration file if not explicitly
   * provided.
   * @implSpec This value should be used to set the --kube-skip-tls-verification <kubeSkipTlsVerification> flag
   * for all Helm commands.
   */
  kubeSkipTlsVerification(kubeSkipTlsVerification: boolean | null): HelmClientBuilder;

  /**
   * Sets the server name to use for certificate verification of the Kubernetes API server for the HelmClient
   * instance.
   *
   * @param kubeTlsServerName the server name to use for certificate verification of the Kubernetes API server.
   * @returns the HelmClientBuilder instance.
   * @implNote The Kubernetes TLS server name is read from the Kubernetes configuration file if not explicitly provided.
   * @implSpec This value should be used to set the --kube-tls-server-name <kubeTlsServerName> flag for all Helm
   * commands.
   */
  kubeTlsServerName(kubeTlsServerName: string): HelmClientBuilder;

  /**
   * Sets the kubernetes bearer token for the HelmClient instance.
   *
   * @param kubeToken the kubernetes bearer token.
   * @returns the HelmClientBuilder instance.
   * @implNote The Kubernetes bearer token is read from the Kubernetes configuration file if not explicitly provided.
   * @implSpec This value should be used to set the --kube-token <kubeToken> flag for all Helm commands.
   */
  kubeToken(kubeToken: string): HelmClientBuilder;

  /**
   * Sets the path to the Kubernetes configuration file for the HelmClient instance.
   *
   * @param kubeConfig the path to the Kubernetes configuration file.
   * @returns the HelmClientBuilder instance.
   * @implNote The Kubernetes configuration file is read from the default location if not explicitly provided.
   * @implSpec This value should be used to set the --kubeconfig <kubeConfig> flag for all Helm commands.
   */
  kubeConfig(kubeConfig: string): HelmClientBuilder;

  /**
   * Constructs an instance of the HelmClient with the provided configuration.
   *
   * @returns the HelmClient instance.
   * @throws HelmConfigurationException if the HelmClient instance cannot be constructed.
   * @implNote This method is responsible for extracting the appropriate Helm executable from the package to a
   * temporary working directory. The temporary working directory should be supplied to the HelmClient instance.
   * @see HelmClient
   */
  build(): HelmClient;
}
