// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/HelmExecutionBuilder.js';
import {type HelmRequest} from '../HelmRequest.js';
import {type Repository} from '../../model/Repository.js';

/**
 * A request to add a new Helm repository.
 */
export class RepositoryAddRequest implements HelmRequest {
  constructor(private readonly repository: Repository) {
    if (!repository) {
      throw new Error('repository must not be null');
    }
    if (!repository.name || repository.name.trim() === '') {
      throw new Error('repository name must not be null or blank');
    }
    if (!repository.url || repository.url.trim() === '') {
      throw new Error('repository url must not be null or blank');
    }
  }

  apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('repo', 'add').positional(this.repository.name).positional(this.repository.url);
  }
}
