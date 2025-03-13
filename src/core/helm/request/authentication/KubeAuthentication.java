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

package com.hedera.fullstack.helm.client.proxy.request.authentication;

import com.hedera.fullstack.helm.client.execution.HelmExecutionBuilder;
import com.hedera.fullstack.helm.client.proxy.request.HelmRequest;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Authentication parameters for a Kubernetes cluster.
 *
 * @param apiServer the address and port of the Kubernetes API server.
 * @param caFile the path to a file containing the certificate authority for the Kubernetes API server.
 * @param context the name of the Kubernetes context to use.
 * @param skipTlsVerification whether to skip TLS verification.
 * @param tlsServerName the name of the TLS server.
 * @param token the bearer token to use for authentication.
 * @param configFile the path to the Kubernetes config file.
 */
public record KubeAuthentication(
        String apiServer,
        Path caFile,
        String context,
        Boolean skipTlsVerification,
        String tlsServerName,
        String token,
        Path configFile)
        implements HelmRequest {
    /**
     * The name of the Helm argument for the Kubernetes API server address and port number.
     */
    private static final String API_SERVER_ARG_NAME = "kube-apiserver";
    /**
     * The name of the Helm argument for the Kubernetes CA certificate file.
     */
    private static final String CA_FILE_ARG_NAME = "kube-ca-file";
    /**
     * The name of the Helm argument for the Kubernetes context.
     */
    private static final String CONTEXT_ARG_NAME = "kube-context";
    /**
     * The name of the Helm argument for whether to skip TLS verification.
     */
    private static final String SKIP_TLS_VERIFICATION_ARG_NAME = "kube-insecure-skip-tls-verify";
    /**
     * The name of the Helm argument for the TLS server name.
     */
    private static final String TLS_SERVER_NAME_ARG_NAME = "kube-tls-server-name";
    /**
     * The name of the Helm argument for the bearer token.
     */
    private static final String TOKEN_ARG_NAME = "kube-token";
    /**
     * The name of the Helm argument for the Kubernetes config file.
     */
    private static final String CONFIG_FILE_ARG_NAME = "kubeconfig";

    @Override
    public void apply(HelmExecutionBuilder builder) {
        if (apiServer != null && !apiServer.isBlank()) {
            builder.argument(API_SERVER_ARG_NAME, apiServer);
        }

        if (caFile != null && Files.exists(caFile)) {
            builder.argument(CA_FILE_ARG_NAME, caFile.toString());
        }

        if (context != null && !context.isBlank()) {
            builder.argument(CONTEXT_ARG_NAME, context);
        }

        if (skipTlsVerification != null) {
            builder.argument(SKIP_TLS_VERIFICATION_ARG_NAME, skipTlsVerification.toString());
        }

        if (tlsServerName != null && !tlsServerName.isBlank()) {
            builder.argument(TLS_SERVER_NAME_ARG_NAME, tlsServerName);
        }

        if (token != null && !token.isBlank()) {
            builder.argument(TOKEN_ARG_NAME, token);
        }

        if (configFile != null && Files.exists(configFile)) {
            builder.argument(CONFIG_FILE_ARG_NAME, configFile.toString());
        }
    }
}
