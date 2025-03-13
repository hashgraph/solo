/*
 * Copyright (C) 2023 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package com.hedera.fullstack.helm.client;

import java.nio.file.Path;

/**
 * {@code HelmClientBuilder} is used to construct instances of {@link HelmClient}. This interface defines the standard
 * methods which all {@link HelmClient} builders must implement.
 *
 * @implNote The {@link HelmClientBuilder#build()} method is responsible for extracting the appropriate Helm executable
 * from the JAR archive. The Helm executable should be extracted to a temporary directory which is supplied to the
 * {@link HelmClient} implementation.
 * @see HelmClient
 */
public interface HelmClientBuilder {

    /**
     * Sets the default namespace for the {@link HelmClient} instance.
     *
     * @param namespace the Kubernetes namespace to use by default.
     * @return the {@link HelmClientBuilder} instance.
     * @implNote The kubernetes cluster's default namespace is used if the namespace is not explicitly provided.
     * @implSpec This value should be used to set the {@code --namespace <namespace>} flag for all Helm commands unless
     * overridden by a specific {@link HelmClient} method.
     */
    HelmClientBuilder defaultNamespace(String namespace);

    /**
     * Sets the working directory for the {@link HelmClient} instance.
     * @param workingDirectory the working directory.
     * @return the {@link HelmClientBuilder} instance.
     * @implNote The working directory is set to the pwd if not explicitly provided, if that fails it will use the
     * parent folder of the helm executable.
     */
    HelmClientBuilder workingDirectory(Path workingDirectory);

    /**
     * Sets the Kubernetes API server address and port number for the {@link HelmClient} instance.
     *
     * @param kubeApiServer the Kubernetes API server address and port number.
     * @return the {@link HelmClientBuilder} instance.
     * @implNote The Kubernetes API server address and port number are read from the Kubernetes configuration file if not
     * explicitly provided.
     * @implSpec This value should be used to set the {@code --kube-apiserver <kubeApiServer>} flag for all Helm commands.
     */
    HelmClientBuilder kubeApiServer(String kubeApiServer);

    /**
     * Sets the path to the Kubernetes CA certificate file for the {@link HelmClient} instance.
     *
     * @param kubeCAFile the path to the Kubernetes API server CA certificate file.
     * @return the {@link HelmClientBuilder} instance.
     * @implNote The Kubernetes CA certificate file path is read from the Kubernetes configuration file if not explicitly
     * provided.
     * @implSpec This value should be used to set the {@code --kube-ca-file <kubeCAFile>} flag for all Helm commands.
     */
    HelmClientBuilder kubeCAFile(Path kubeCAFile);

    /**
     * Sets the context defined in the kube config file to use for the {@link HelmClient} instance. If this value is not
     * provided, the current context is used.
     *
     * @param kubeContext the name of the context defined in the kube config file to use.
     * @return the {@link HelmClientBuilder} instance.
     * @implNote The Kubernetes context is read from the Kubernetes configuration file if not explicitly provided.
     * @implSpec This value should be used to set the {@code --kube-context <kubeContext>} flag for all Helm commands.
     */
    HelmClientBuilder kubeContext(String kubeContext);

    /**
     * Sets whether to skip TLS verification when communicating with the Kubernetes API server for the {@link HelmClient}
     * instance.
     *
     * @param kubeSkipTlsVerification indicates whether to skip TLS verification when communicating with the Kubernetes API
     *                                server. This value may be {@code null} to indicate that the default value should be
     *                                used.
     * @return the {@link HelmClientBuilder} instance.
     * @implNote The Kubernetes skip TLS verification flag is read from the Kubernetes configuration file if not explicitly
     * provided.
     * @implSpec This value should be used to set the {@code --kube-skip-tls-verification <kubeSkipTlsVerification>} flag
     * for all Helm commands.
     */
    HelmClientBuilder kubeSkipTlsVerification(Boolean kubeSkipTlsVerification);

    /**
     * Sets the server name to use for certificate verification of the Kubernetes API server for the {@link HelmClient}
     * instance.
     *
     * @param kubeTlsServerName the server name to use for certificate verification of the Kubernetes API server.
     * @return the {@link HelmClientBuilder} instance.
     * @implNote The Kubernetes TLS server name is read from the Kubernetes configuration file if not explicitly provided.
     * @implSpec This value should be used to set the {@code --kube-tls-server-name <kubeTlsServerName>} flag for all Helm
     * commands.
     */
    HelmClientBuilder kubeTlsServerName(String kubeTlsServerName);

    /**
     * Sets the kubernetes bearer token for the {@link HelmClient} instance.
     *
     * @param kubeToken the kubernetes bearer token.
     * @return the {@link HelmClientBuilder} instance.
     * @implNote The Kubernetes bearer token is read from the Kubernetes configuration file if not explicitly provided.
     * @implSpec This value should be used to set the {@code --kube-token <kubeToken>} flag for all Helm commands.
     */
    HelmClientBuilder kubeToken(String kubeToken);

    /**
     * Sets the path to the Kubernetes configuration file for the {@link HelmClient} instance.
     *
     * @param kubeConfig the path to the Kubernetes configuration file.
     * @return the {@link HelmClientBuilder} instance.
     * @implNote The Kubernetes configuration file is read from the default location if not explicitly provided.
     * @implSpec This value should be used to set the {@code --kubeconfig <kubeConfig>} flag for all Helm commands.
     */
    HelmClientBuilder kubeConfig(Path kubeConfig);

    /**
     * Constructs an instance of the {@link HelmClient} with the provided configuration.
     *
     * @return the {@link HelmClient} instance.
     * @throws HelmConfigurationException if the {@link HelmClient} instance cannot be constructed.
     * @implNote This method is responsible for extracting the appropriate Helm executable from the JAR archive to a
     * temporary working directory. The temporary working directory should be supplied to the {@link HelmClient} instance.
     * @see HelmClient
     */
    HelmClient build();
}
