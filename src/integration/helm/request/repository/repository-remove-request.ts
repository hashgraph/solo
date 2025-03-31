// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type HelmRequest} from '../helm-request.js';
import {type Repository} from '../../model/repository.js';

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
    builder.subcommands('repo', 'remove').positional(this.repository.name);
  }
}
