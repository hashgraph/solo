// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type HelmRequest} from '../helm-request.js';

/**
 * A request for the values a release was last rendered with.
 *
 * `--all` asks for the coalesced values — the chart's own defaults merged with whatever the caller
 * supplied — rather than only the user-supplied overrides. That matters because the overrides alone
 * omit everything under `defaults.*`, which is exactly the part a caller needs when it has to
 * reconstruct what the release is currently running from.
 */
export class ReleaseGetValuesRequest implements HelmRequest {
  public constructor(
    private readonly releaseName: string,
    private readonly namespace?: string,
    private readonly kubeContext?: string,
    private readonly allValues: boolean = true,
  ) {
    if (!releaseName || !releaseName.trim()) {
      throw new Error('releaseName must not be blank');
    }
  }

  public apply(builder: HelmExecutionBuilder): void {
    builder.argument('output', 'json');

    if (this.namespace) {
      builder.argument('namespace', this.namespace);
    }

    if (this.kubeContext) {
      builder.argument('kube-context', this.kubeContext);
    }

    if (this.allValues) {
      builder.flag('--all');
    }

    builder.subcommands('get', 'values', this.releaseName);
  }
}
