// SPDX-License-Identifier: Apache-2.0

import { HelmExecutionBuilder } from '../../execution/HelmExecutionBuilder.js';
import { HelmRequest } from '../HelmRequest.js';

/**
 * A request to list all Helm repositories.
 */
export class RepositoryListRequest implements HelmRequest {
  apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('repo', 'list');
  }
} 