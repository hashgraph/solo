// SPDX-License-Identifier: Apache-2.0

import { HelmExecutionBuilder } from '../../execution/HelmExecutionBuilder.js';
import { HelmRequest } from '../HelmRequest.js';

/**
 * A request to list all Helm releases.
 */
export class ReleaseListRequest implements HelmRequest {
  constructor(private readonly allNamespaces: boolean) {}

  apply(builder: HelmExecutionBuilder): void {
    builder.argument('output', 'json');

    if (this.allNamespaces) {
      builder.flag('--all-namespaces');
    }

    builder.subcommands('list');
  }
} 