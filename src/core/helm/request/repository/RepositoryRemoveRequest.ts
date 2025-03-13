// SPDX-License-Identifier: Apache-2.0

import { HelmExecutionBuilder } from '../../execution/HelmExecutionBuilder.js';
import { HelmRequest } from '../HelmRequest.js';
import { Repository } from '../../model/Repository.js';

/**
 * A request to remove a Helm repository.
 */
export class RepositoryRemoveRequest implements HelmRequest {
  constructor(private readonly repository: Repository) {
    if (!repository) {
      throw new Error('repository must not be null');
    }
  }

  apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('repo', 'remove');
    builder.positional(this.repository.name);
  }
} 