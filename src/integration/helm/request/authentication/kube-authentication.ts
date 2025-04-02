// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type HelmRequest} from '../helm-request.js';
import {existsSync} from 'node:fs';

/**
 * Authentication parameters for a Kubernetes cluster.
 */
export class KubeAuthentication implements HelmRequest {
  /**
   * The name of the Helm argument for the Kubernetes API server address and port number.
   */
  private static readonly API_SERVER_ARG_NAME = 'kube-apiserver';

  /**
   * The name of the Helm argument for the Kubernetes CA certificate file.
   */
  private static readonly CA_FILE_ARG_NAME = 'kube-ca-file';

  /**
   * The name of the Helm argument for the Kubernetes context.
   */
  private static readonly CONTEXT_ARG_NAME = 'kube-context';

  /**
   * The name of the Helm argument for whether to skip TLS verification.
   */
  private static readonly SKIP_TLS_VERIFICATION_ARG_NAME = 'kube-insecure-skip-tls-verify';

  /**
   * The name of the Helm argument for the TLS server name.
   */
  private static readonly TLS_SERVER_NAME_ARG_NAME = 'kube-tls-server-name';

  /**
   * The name of the Helm argument for the bearer token.
   */
  private static readonly TOKEN_ARG_NAME = 'kube-token';

  /**
   * The name of the Helm argument for the Kubernetes config file.
   */
  private static readonly CONFIG_FILE_ARG_NAME = 'kubeconfig';

  constructor(
    public readonly apiServer?: string,
    public readonly caFile?: string,
    public readonly context?: string,
    public readonly skipTlsVerification?: boolean,
    public readonly tlsServerName?: string,
    public readonly token?: string,
    public readonly configFile?: string,
  ) {}

  apply(builder: HelmExecutionBuilder): void {
    if (this.apiServer?.trim()) {
      builder.argument(KubeAuthentication.API_SERVER_ARG_NAME, this.apiServer);
    }

    if (this.caFile && existsSync(this.caFile)) {
      builder.argument(KubeAuthentication.CA_FILE_ARG_NAME, this.caFile);
    }

    if (this.context?.trim()) {
      builder.argument(KubeAuthentication.CONTEXT_ARG_NAME, this.context);
    }

    if (this.skipTlsVerification !== undefined) {
      builder.argument(KubeAuthentication.SKIP_TLS_VERIFICATION_ARG_NAME, this.skipTlsVerification.toString());
    }

    if (this.tlsServerName?.trim()) {
      builder.argument(KubeAuthentication.TLS_SERVER_NAME_ARG_NAME, this.tlsServerName);
    }

    if (this.token?.trim()) {
      builder.argument(KubeAuthentication.TOKEN_ARG_NAME, this.token);
    }

    if (this.configFile && existsSync(this.configFile)) {
      builder.argument(KubeAuthentication.CONFIG_FILE_ARG_NAME, this.configFile);
    }
  }
}
