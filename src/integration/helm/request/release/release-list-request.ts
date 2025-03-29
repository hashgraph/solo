// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type HelmRequest} from '../helm-request.js';

/**
 * A request to list all Helm releases.
 */
export class ReleaseListRequest implements HelmRequest {
  constructor(
    private readonly allNamespaces: boolean,
    private readonly namespace?: string,
    private readonly kubeContext?: string,
  ) {}

  apply(builder: HelmExecutionBuilder): void {
    builder.argument('output', 'json');

    if (this.allNamespaces) {
      builder.flag('--all-namespaces');
    } else if (this.namespace) {
      builder.argument('namespace', this.namespace);
    }

    if (this.kubeContext) {
      builder.argument('kube-context', this.kubeContext);
    }

    builder.subcommands('list');
  }
}
