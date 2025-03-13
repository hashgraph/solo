// SPDX-License-Identifier: Apache-2.0

import { HelmExecutionBuilder } from '../../execution/HelmExecutionBuilder.js';
import { HelmRequest } from '../HelmRequest.js';
import { Repository } from '../../model/Repository.js';

/**
 * A request to add a new Helm repository.
 */
export class RepositoryAddRequest implements HelmRequest {
  constructor(private readonly repository: Repository) {
    if (!repository) {
      throw new Error('repository must not be null');
    }
    if (!repository.name?.trim()) {
      throw new Error('repository name must not be null or blank');
    }
    if (!repository.url?.trim()) {
      throw new Error('repository url must not be null or blank');
    }
  }

  apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('repo', 'add', this.repository.name, this.repository.url);
  }
} 