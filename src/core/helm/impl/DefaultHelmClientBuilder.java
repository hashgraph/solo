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

package com.hedera.fullstack.helm.client.impl;

import com.hedera.fullstack.helm.client.HelmClient;
import com.hedera.fullstack.helm.client.HelmClientBuilder;
import com.hedera.fullstack.helm.client.proxy.request.authentication.KubeAuthentication;
import com.hedera.fullstack.helm.client.resource.HelmSoftwareLoader;
import java.nio.file.Path;

/**
 * The default implementation of the {@link HelmClientBuilder} interface.
 */
public final class DefaultHelmClientBuilder implements HelmClientBuilder {

    /**
     * The default namespace to be set by the {@link HelmClient}. Defaults to a {@code null} value which indicates that
     * the Helm {@code -n <namespace>} argument should not be specified.
     */
    private String defaultNamespace;

    /**
     * The working directory to be used by the {@link HelmClient}.
     */
    private Path workingDirectory;

    /**
     * The kubernetes API server address and port number to which the client should connect. Defaults to a {@code null}
     * value which indicates that the Helm {@code --kube-apiserver <address_and_port>} argument should not be specified.
     */
    private String kubeApiServer;

    /**
     * The kubernetes CA certificate file. Defaults to a {@code null} value which indicates that the Helm
     * {@code --kube-ca-file <ca_file>} argument should not be specified.
     */
    private Path kubeCAFile;

    /**
     * The kubernetes context from the kube config file to be used. Defaults to a {@code null} value which indicates
     * that the Helm {@code --kube-context <context>} argument should not be specified.
     */
    private String kubeContext;

    /**
     * Specifies whether the Helm client should skip TLS certificate verification. Defaults to a {@code null} value
     * which indicates that the Helm {@code --kube-insecure-skip-tls-verify <bool>} argument should not be specified.
     */
    private Boolean kubeSkipTlsVerification;

    /**
     * The kubernetes server name to use for TLS server certificate validation. Defaults to a {@code null} value
     * which indicates that the Helm {@code --kube-tls-server-name <name>} argument should not be specified.
     */
    private String kubeTlsServerName;

    /**
     * The kubernetes bearer token to be used for authentication. Defaults to a {@code null} values which indicates that
     * the Helm {@code --kube-token <token>} argument should not be specified.
     */
    private String kubeToken;

    /**
     * The path to the kube config file. Defaults to a {@code null} value which indicates that the Helm
     * {@code --kubeconfig <context>} argument should not be specified.
     */
    private Path kubeConfig;

    /**
     * Constructs a new builder instance and initializes it with the default configuration.
     */
    public DefaultHelmClientBuilder() {}

    @Override
    public HelmClientBuilder defaultNamespace(final String namespace) {
        this.defaultNamespace = namespace;
        return this;
    }

    @Override
    public HelmClientBuilder workingDirectory(final Path workingDirectory) {
        this.workingDirectory = workingDirectory;
        return this;
    }

    @Override
    public HelmClientBuilder kubeApiServer(String kubeApiServer) {
        this.kubeApiServer = kubeApiServer;
        return this;
    }

    @Override
    public HelmClientBuilder kubeCAFile(Path kubeCAFile) {
        this.kubeCAFile = kubeCAFile;
        return this;
    }

    @Override
    public HelmClientBuilder kubeContext(String kubeContext) {
        this.kubeContext = kubeContext;
        return this;
    }

    @Override
    public HelmClientBuilder kubeSkipTlsVerification(Boolean kubeSkipTlsVerification) {
        this.kubeSkipTlsVerification = kubeSkipTlsVerification;
        return this;
    }

    @Override
    public HelmClientBuilder kubeTlsServerName(String kubeTlsServerName) {
        this.kubeTlsServerName = kubeTlsServerName;
        return this;
    }

    @Override
    public HelmClientBuilder kubeToken(String kubeToken) {
        this.kubeToken = kubeToken;
        return this;
    }

    @Override
    public HelmClientBuilder kubeConfig(Path kubeConfig) {
        this.kubeConfig = kubeConfig;
        return this;
    }

    @Override
    public HelmClient build() {
        final Path helmExecutable = HelmSoftwareLoader.installSupportedVersion();
        final KubeAuthentication kubeAuthentication = new KubeAuthentication(
                kubeApiServer,
                kubeCAFile,
                kubeContext,
                kubeSkipTlsVerification,
                kubeTlsServerName,
                kubeToken,
                kubeConfig);
        return new DefaultHelmClient(helmExecutable, kubeAuthentication, defaultNamespace, workingDirectory);
    }
}
